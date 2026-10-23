const https = require('https');

/**
 * Sends a text message via WhatsApp Business API (Meta Graph API).
 * 
 * @param {string} recipientPhone - The phone number to send the message to (with country code).
 * @param {string} messageContent - The body text of the message.
 * @returns {Promise<Object>} - The API response.
 */
async function sendWhatsAppMessage(recipientPhone, messageContent) {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
        throw new Error('❌ Missing Meta configuration (Access Token or Phone Number ID) in .env');
    }

    const data = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: {
            preview_url: false,
            body: messageContent
        }
    });

    const options = {
        hostname: 'graph.facebook.com',
        path: `/v22.0/${phoneNumberId}/messages`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (d) => {
                responseBody += d;
            });

            res.on('end', () => {
                const parsed = JSON.parse(responseBody);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(parsed);
                } else {
                    reject(new Error(parsed.error?.message || 'Meta API Error'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

module.exports = { sendWhatsAppMessage };
