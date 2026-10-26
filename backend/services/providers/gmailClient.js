const { google } = require('googleapis');
const env = require('../../config/env');
const { encryptSecret, decryptSecret } = require('../../utils/secretBox');

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

function assertGmailConfigured() {
  if (!env.gmailConfigured) {
    const err = new Error('Gmail OAuth is not configured on the server');
    err.status = 503;
    err.code = 'GMAIL_NOT_CONFIGURED';
    throw err;
  }
}

function createOAuthClient() {
  assertGmailConfigured();
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri
  );
}

/** Decrypt the legacy User token fields (plaintext rows still work). */
function loadCredentials(user) {
  if (!user) return {};
  return {
    access_token: decryptSecret(user.googleAccessToken),
    refresh_token: decryptSecret(user.googleRefreshToken),
    expiry_date: user.googleTokenExpiry || undefined,
  };
}

function getAuthedGmail(user) {
  const auth = createOAuthClient();
  auth.setCredentials(loadCredentials(user));
  return { auth, gmail: google.gmail({ version: 'v1', auth }) };
}

/** Persist refreshed access tokens (encrypted) after a Gmail API call. */
async function persistRefreshedTokens(User, userId, credentials) {
  if (!credentials?.access_token && !credentials?.refresh_token) return;
  const update = {};
  if (credentials.access_token) update.googleAccessToken = encryptSecret(credentials.access_token);
  if (credentials.refresh_token) update.googleRefreshToken = encryptSecret(credentials.refresh_token);
  if (credentials.expiry_date) update.googleTokenExpiry = credentials.expiry_date;
  if (Object.keys(update).length) {
    await User.findByIdAndUpdate(userId, update);
  }
}

function headerValue(headers, name) {
  return (headers || []).find((h) => String(h.name).toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Walk MIME parts and prefer text/plain, falling back to HTML. */
function extractTextBody(payload) {
  if (!payload) return '';
  const plain = [];
  const html = [];

  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || '';
    const data = part.body?.data;
    if (data) {
      if (mime === 'text/plain') plain.push(decodeBase64Url(data));
      else if (mime === 'text/html') html.push(decodeBase64Url(data));
    }
    (part.parts || []).forEach(walk);
  };
  walk(payload);

  let body = plain.join('\n').trim();
  if (!body) {
    body = html.join('\n')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return body.slice(0, 5000);
}

function parseGmailMessage(message, fallbackEmail = '') {
  const headers = message.payload?.headers || [];
  const from = headerValue(headers, 'From');
  const to = headerValue(headers, 'To');
  const subject = headerValue(headers, 'Subject') || 'No Subject';
  const date = headerValue(headers, 'Date');
  const messageIdHeader = headerValue(headers, 'Message-ID');
  const references = headerValue(headers, 'References');
  const body = extractTextBody(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds || [],
    snippet: message.snippet || '',
    from,
    to,
    subject,
    date,
    rfcMessageId: messageIdHeader,
    references,
    body,
    fallbackEmail,
  };
}

function extractEmail(value) {
  const text = String(value || '');
  const match = text.match(/<([^>\s]+@[^>\s]+)>/);
  if (match) return match[1].toLowerCase();
  const bare = text.match(/([^\s<>,;]+@[^\s<>,;]+)/);
  return bare ? bare[1].toLowerCase() : '';
}

function extractName(value) {
  const text = String(value || '');
  const match = text.match(/^\s*"?([^"<]+?)"?\s*</);
  if (match) return match[1].trim();
  return extractEmail(text) || text;
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeSubject(subject) {
  // RFC 2047 encoded-word keeps non-ASCII subject lines valid.
  if (/^[\x20-\x7E]*$/.test(subject)) return cleanHeader(subject);
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function buildRawReply({ from, to, subject, body, inReplyTo, references }) {
  const safeSubject = cleanHeader(subject || 'Re: your message');
  const subjectLine = /^re:/i.test(safeSubject) ? safeSubject : `Re: ${safeSubject}`;
  const headers = [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${encodeSubject(subjectLine)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${cleanHeader(inReplyTo)}`);
  if (references) headers.push(`References: ${cleanHeader(references)}`);
  const raw = `${headers.join('\r\n')}\r\n\r\n${String(body).replace(/\r?\n/g, '\r\n')}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

async function sendGmailReply({ User, user, event, text }) {
  const { auth, gmail } = getAuthedGmail(user);
  const content = event.content || {};
  const to = content.senderEmail || extractEmail(content.sender);
  if (!to) throw new Error('This email has no reply address.');

  const fromEmail = user.googleEmail || '';
  const raw = buildRawReply({
    from: fromEmail,
    to,
    subject: content.subject || content.text?.split('\n')?.[0]?.replace(/^Subject:\s*/i, '') || 'Re: your message',
    body: text,
    inReplyTo: content.rfcMessageId,
    references: [content.references, content.rfcMessageId].filter(Boolean).join(' '),
  });

  const requestBody = { raw };
  if (content.threadId) requestBody.threadId = content.threadId;

  const result = await gmail.users.messages.send({ userId: 'me', requestBody });
  await persistRefreshedTokens(User, user._id, auth.credentials);
  return {
    providerMessageId: result.data.id,
    threadId: result.data.threadId || content.threadId || null,
  };
}

module.exports = {
  GMAIL_SCOPES,
  createOAuthClient,
  loadCredentials,
  getAuthedGmail,
  persistRefreshedTokens,
  parseGmailMessage,
  extractTextBody,
  extractEmail,
  extractName,
  buildRawReply,
  sendGmailReply,
};
