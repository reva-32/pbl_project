const DecisionEvent = require('../models/DecisionEvent');
const { getEmbedding } = require('../services/ragService');
const { retainBusinessMemory } = require('../services/hindsightService');

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

        // Keep the external memory useful while avoiding common direct contact identifiers.
        const memoryText = String(text)
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, '[email redacted]')
            .replace(/\\b(?:\\+?\\d[\\d\\s().-]{7,}\\d)\\b/g, '[phone redacted]')
            .slice(0, 4000);
        retainBusinessMemory(req.userId, `Business record (${type}): ${memoryText}`, {
            source: `record_${String(type).toLowerCase()}`,
            documentId: newEvent._id.toString(),
            timestamp: newEvent.timestamp.toISOString(),
        }).catch((hindsightError) => {
            // External memory is best-effort; MongoDB remains the source of truth.
            console.error('⚠️ Hindsight record retention failed:', hindsightError.message);
        });

        console.log('✅ Saved to Business Memory');
        res.status(201).json({ message: 'Data successfully ingested', id: newEvent._id });

    } catch (error) {
        console.error('❌ Ingestion Error:', error);
        res.status(500).json({ error: 'Ingestion failed', details: error.message });
    }
};

module.exports = { ingestData: exports.ingestData };