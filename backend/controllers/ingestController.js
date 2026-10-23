const DecisionEvent = require('../models/DecisionEvent');
const { getEmbedding } = require('../services/ragService');

exports.ingestData = async (req, res) => {
    try {
        const { text, type, metadata } = req.body;

        if (!text || !type) {
            return res.status(400).json({ error: 'Text and Type are required' });
        }

        console.log(`📥 Ingesting: "${text.substring(0, 30)}..."`);

        const embedding = await getEmbedding(text);

        const newEvent = new DecisionEvent({
            userId: req.userId,
            type,
            content: { text, ...metadata },
            embedding,
        });

        await newEvent.save();

        console.log('✅ Saved to Business Memory');
        res.status(201).json({ message: 'Data successfully ingested', id: newEvent._id });

    } catch (error) {
        console.error('❌ Ingestion Error:', error);
        res.status(500).json({ error: 'Ingestion failed', details: error.message });
    }
};

module.exports = { ingestData: exports.ingestData };