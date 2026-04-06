const DecisionEvent = require('../models/DecisionEvent');
const { pipeline } = require('@xenova/transformers');

// Singleton Pattern: Load the model once and reuse it
let embedder = null;

async function getEmbedding(text) {
    if (!embedder) {
        console.log("⏳ Loading local embedding model (first time only)...");
        // This downloads a small, high-speed model (approx 80MB)
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    // Generate vector
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data); // Convert to standard array
}

exports.ingestData = async (req, res) => {
    try {
        const { text, type, metadata } = req.body;

        if (!text || !type) {
            return res.status(400).json({ error: "Text and Type are required" });
        }

        console.log(`📥 Ingesting: "${text.substring(0, 30)}..."`);

        // Generate Embedding Locally
        const embedding = await getEmbedding(text);

        const newEvent = new DecisionEvent({
            type,
            content: { text, ...metadata },
            embedding
        });

        await newEvent.save();

        console.log("✅ Saved to Business Memory (Local Vector)");
        res.status(201).json({ message: "Data successfully ingested", id: newEvent._id });

    } catch (error) {
        console.error("❌ Ingestion Error:", error);
        res.status(500).json({ error: "Ingestion failed", details: error.message });
    }
};
module.exports = { ingestData: exports.ingestData };