const axios = require('axios');

async function testWebhook() {
    const port = 5001;
    const url = `http://localhost:${port}/api/webhook/meta`;

    const mockMessage = {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'WHATSAPP_ID',
            changes: [{
                value: {
                    from: '919876543210',
                    message: {
                        text: 'URGENT: Is my order for 50 units ready? I need to make the payment now.'
                    }
                },
                field: 'messages'
            }]
        }]
    };

    try {
        console.log('🚀 Sending mock URGENT/PAYMENT message to your new webhook...');
        const response = await axios.post(url, mockMessage);
        console.log('✅ Response from Webhook:', response.data);
        console.log('---');
        console.log('Now check your "Smart Inbox" in the frontend to see the AI classification!');
    } catch (error) {
        console.error('❌ Error sending mock message:', error.response ? error.response.data : error.message);
    }
}

testWebhook();
