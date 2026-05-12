const { google } = require('googleapis');
const User = require('../models/user');

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

    console.log(`✅ Gmail Watch setup successful for user ${user.email}. History ID: ${watchRes.data.historyId}`);

    // Redirect back to frontend integrations
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/integrations?gmail_connected=true`);

  } catch (error) {
    console.error('❌ Error during Gmail Auth Callback:', error);
    res.status(500).send('Authentication failed.');
  }
};
