const { google } = require('googleapis');
const User = require('../models/user');
const DecisionEvent = require('../models/DecisionEvent');
const { classifyMessage } = require('../services/aiClassifier');
const { getEmbedding } = require('../services/ragService');

const getOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};

exports.getAuthUrl = (req, res) => {
  const userId = req.userId; // Provided by authMiddleware
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }

  const oauth2Client = getOAuthClient();

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get a refresh token
    prompt: 'consent',      // Force consent to ensure refresh token is returned
    scope: scopes,
    state: userId           // Pass userId in state so we know who is connecting
  });

  res.json({ url });
};

exports.authCallback = async (req, res) => {
  const { code, state } = req.query;
  const userId = state;

  if (!code || !userId) {
    return res.status(400).send('Missing code or state parameter.');
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Set up Gmail Push Notification (Watch)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Fetch the actual Gmail address being connected
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const googleEmail = profileRes.data.emailAddress;

    // Update user in database
    const updateData = {
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: tokens.expiry_date,
      googleEmail: googleEmail
    };
    if (tokens.refresh_token) {
      updateData.googleRefreshToken = tokens.refresh_token;
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });
    if (!user) {
      return res.status(404).send('User not found.');
    }

    const watchRes = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GOOGLE_PUBSUB_TOPIC,
        labelIds: ['INBOX'], // Only notify for inbox changes
      }
    });

    // Save the historyId from watch — future webhooks start from here, not from the beginning
    await User.findByIdAndUpdate(userId, {
      lastGmailHistoryId: String(watchRes.data.historyId)
    });

    console.log(`✅ Gmail Watch setup for ${user.email}. Starting historyId: ${watchRes.data.historyId}`);

    // Redirect back to frontend integrations
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    res.redirect(`${frontendUrl}/integrations?gmail_connected=true`);

  } catch (error) {
    console.error('❌ Error during Gmail Auth Callback:', error);
    res.status(500).send('Authentication failed.');
  }
};

/**
 * GET /api/webhook/gmail/auth/status
 * Returns the Gmail connection status and stored tokens for the logged-in user.
 */
exports.gmailStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      'googleEmail googleAccessToken googleRefreshToken googleTokenExpiry lastGmailHistoryId'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      connected: !!(user.googleRefreshToken && user.googleEmail),
      googleEmail: user.googleEmail,
      hasAccessToken: !!user.googleAccessToken,
      hasRefreshToken: !!user.googleRefreshToken,
      tokenExpiry: user.googleTokenExpiry
        ? new Date(user.googleTokenExpiry).toISOString()
        : null,
      lastGmailHistoryId: user.lastGmailHistoryId,
      savedMessages: await DecisionEvent.countDocuments({
        userId: req.userId,
        type: 'CUSTOMER_MSG',
        'content.platform': 'Email'
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/webhook/gmail/auth/sync
 * Manually fetches the last `limit` inbox emails and stores any new ones.
 * Useful when Pub/Sub push notifications aren't working.
 */
exports.manualSync = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'Gmail not connected. Please connect Gmail first.' });
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token:  user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date:   user.googleTokenExpiry
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const limit = parseInt(req.query.limit) || 20;

    // List recent INBOX messages (excluding ones sent by the user)
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      labelIds: ['INBOX'],
      q: `-from:${user.googleEmail}` // Exclude self-sent
    });

    const messageList = listRes.data.messages || [];
    if (messageList.length === 0) {
      return res.json({ synced: 0, message: 'No inbox messages found.' });
    }

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const { id: messageId } of messageList) {
      // Deduplicate
      const exists = await DecisionEvent.findOne({ 'content.gmailMessageId': messageId });
      if (exists) { skipped++; continue; }

      let msgRes;
      try {
        msgRes = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      } catch (e) {
        errors.push(`Failed to fetch ${messageId}: ${e.message}`);
        continue;
      }

      const headers = msgRes.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from    = headers.find(h => h.name === 'From')?.value    || 'Unknown Sender';
      const date    = headers.find(h => h.name === 'Date')?.value;

      // Skip outgoing
      if (from.includes(user.googleEmail)) { skipped++; continue; }

      // Extract body
      let body = '';
      const textPart = (msgRes.data.payload?.parts || []).find(p => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8').slice(0, 1000);
      } else if (msgRes.data.payload?.body?.data) {
        body = Buffer.from(msgRes.data.payload.body.data, 'base64').toString('utf-8').slice(0, 1000);
      }

      // AI classify + embed
      const analysis  = await classifyMessage(`Subject: ${subject}\n\n${body}`);
      const embedding = await getEmbedding(`Email from ${from}: ${subject} ${body}`);

      await new DecisionEvent({
        userId: user._id,
        type:   'CUSTOMER_MSG',
        content: {
          sender:         from,
          text:           `Subject: ${subject}\n\n${body}`,
          platform:       'Email',
          summary:        analysis.summary,
          category:       analysis.category,
          priority:       analysis.priority,
          isRead:         false,
          gmailMessageId: messageId
        },
        embedding,
        timestamp: date ? new Date(date) : new Date()
      }).save();

      console.log(`✅ Manual sync saved: "${subject}" from ${from}`);
      synced++;
    }

    // Update access token if refreshed
    const updatedCreds = oauth2Client.credentials;
    if (updatedCreds.access_token && updatedCreds.access_token !== user.googleAccessToken) {
      await User.findByIdAndUpdate(user._id, {
        googleAccessToken: updatedCreds.access_token,
        googleTokenExpiry: updatedCreds.expiry_date
      });
    }

    res.json({ synced, skipped, errors, total: messageList.length });

  } catch (err) {
    console.error('❌ Manual Gmail sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
