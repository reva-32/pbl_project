const env = require('../../config/env');

/**
 * Minimal Meta Graph API client.
 *
 * - Uses the global fetch available in Node 18+.
 * - Never places access tokens in URLs or logs.
 * - Converts provider failures into a small, safe error shape so routes can
 *   return a useful message without leaking request details.
 */
class ProviderError extends Error {
  constructor(message, { status = 502, code = null, subcode = null, provider = 'meta', retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
    this.subcode = subcode;
    this.provider = provider;
    this.retryable = retryable;
  }
}

function graphBase(version = env.metaGraphVersion) {
  return `https://graph.facebook.com/${version}`;
}

function parseGraphError(status, json) {
  const err = json?.error || {};
  const message = typeof err.message === 'string' ? err.message : 'Meta API request failed';
  // Never surface request tokens or full payloads.
  const retryable = status === 429 || err.code === 4 || err.code === 17 || err.code === 32;
  return new ProviderError(message, {
    status: status >= 400 && status < 500 ? status : 502,
    code: err.code ?? null,
    subcode: err.error_subcode ?? null,
    retryable,
  });
}

async function graphRequest(path, {
  method = 'GET',
  token,
  query = {},
  body,
  fetchImpl = fetch,
  timeoutMs = 15000,
} = {}) {
  const url = new URL(`${graphBase()}/${String(path).replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ProviderError('Could not reach Meta. Please try again.', {
      status: 503,
      retryable: true,
    });
  }

  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON provider response */ }

  if (!response.ok) throw parseGraphError(response.status, json);
  return json;
}

async function exchangeCode({ code, appId, appSecret, redirectUri, fetchImpl = fetch }) {
  return graphRequest('oauth/access_token', {
    query: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
    fetchImpl,
  });
}

async function getPageAccounts(userAccessToken, { fetchImpl = fetch } = {}) {
  const data = await graphRequest('me/accounts', {
    token: userAccessToken,
    query: {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: 100,
    },
    fetchImpl,
  });
  return Array.isArray(data.data) ? data.data : [];
}

async function subscribePage(pageId, pageAccessToken, { fetchImpl = fetch } = {}) {
  return graphRequest(`${pageId}/subscribed_apps`, {
    method: 'POST',
    token: pageAccessToken,
    fetchImpl,
  });
}

async function verifyWhatsAppAccount(phoneNumberId, accessToken, { fetchImpl = fetch } = {}) {
  return graphRequest(String(phoneNumberId), {
    token: accessToken,
    query: { fields: 'id,display_phone_number,verified_name,account_mode,quality_rating' },
    fetchImpl,
  });
}

async function sendWhatsAppText({ phoneNumberId, accessToken, to, text, fetchImpl = fetch }) {
  return graphRequest(`${phoneNumberId}/messages`, {
    method: 'POST',
    token: accessToken,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    fetchImpl,
  });
}

async function sendMessengerText({ pageId, accessToken, recipientId, text, fetchImpl = fetch }) {
  return graphRequest(`${pageId}/messages`, {
    method: 'POST',
    token: accessToken,
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    },
    fetchImpl,
  });
}

async function sendInstagramText({ igAccountId, accessToken, recipientId, text, fetchImpl = fetch }) {
  return graphRequest(`${igAccountId}/messages`, {
    method: 'POST',
    token: accessToken,
    body: {
      recipient: { id: recipientId },
      message: { text },
    },
    fetchImpl,
  });
}

module.exports = {
  ProviderError,
  graphRequest,
  exchangeCode,
  getPageAccounts,
  subscribePage,
  verifyWhatsAppAccount,
  sendWhatsAppText,
  sendMessengerText,
  sendInstagramText,
};
