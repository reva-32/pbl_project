const DecisionEvent = require('../models/DecisionEvent');
const Groq = require("groq-sdk");
const { pipeline } = require('@xenova/transformers');
const { createInvoicePDF } = require('../utils/invoiceGenerator');
const { calculateProjection } = require('../utils/financialTools');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let embedder = null;

async function getEmbedding(text) {
    if (!embedder) embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    const result = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}

exports.searchEvents = async (req, res) => {
    try {
        const query = req.body.query; // Now coming from FormData
        
        if (!query) return res.status(400).json({ error: "Query required" });

        console.log(`🤔 User asks: "${query}"`);

        const queryVector = await getEmbedding(query);
        const results = await DecisionEvent.aggregate([
            { "$vectorSearch": { "index": "vector_index", "path": "embedding", "queryVector": queryVector, "numCandidates": 50, "limit": 3 } },
            { "$project": { "_id": 0, "type": 1, "content": 1, "status": 1, "timestamp": 1 } }
        ]);

        const internalContext = results.length > 0 
            ? results.map(doc => `[${doc.type}]: ${JSON.stringify(doc.content)}`).join("\n")
            : "EMPTY";

        // --- UPDATED SMART PROMPT ---
        const systemPrompt = `
        You are an elite AI Business Consultant & Agent for MSME 360.
        INTERNAL RECORDS: ${internalContext}
        
        INSTRUCTIONS:
        1. **TASK: INVOICE**: If user wants an invoice, output JSON ONLY:
           { "action": "generate_invoice", "data": { "businessName": "Name", "businessContact": "Contact", "ownerContact": "Owner", "clientName": "Client", "amount": "100", "detailedDescription": "Desc" } }
           (Extract from query. Use generic placeholders like '[Your Business]' if they didn't provide some details).
        
        2. **TASK: FINANCIAL**: Output JSON ONLY:
           { "action": "financial_projection", "data": { "currentRevenue": "100", "currentExpenses": "50", "revenueGrowth": "20", "expenseGrowth": "10" } }

        3. **GENERAL QUESTIONS**: Provide a highly detailed, precise, and professional answer. 
           - DO NOT ever apologize or mention "I couldn't find specific internal records". Just answer the question directly.
           - Use the INTERNAL RECORDS if relevant. If not, use your vast business knowledge.

        4. **FOLLOW-UPS (MANDATORY FOR TEXT ANSWERS)**: Always end your text response with 2 to 3 insightful follow-up questions the user should consider. Format them as bullet points under the exact bold heading: "**Suggested Follow-ups:**".
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: query }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2, 
            max_tokens: 1500, // Increased for longer answers
        });

        const aiResponse = chatCompletion.choices[0]?.message?.content || "";

        // ACTION HANDLER
        if (aiResponse.trim().startsWith('{')) {
            try {
                const command = JSON.parse(aiResponse);
                
                if (command.action === "generate_invoice") {
                    console.log("⚡ Action: Invoice");
                    
                    // Attach the uploaded signature file path if it exists
                    const invoiceData = { 
                        ...command.data, 
                        signaturePath: req.file ? req.file.path : null 
                    };
                    
                    const pdfResult = await createInvoicePDF(invoiceData);
                    
                    if (pdfResult.success) {
                        const invoiceText = `Invoice generated for ${invoiceData.clientName}. Amount: $${invoiceData.amount}. Description: ${invoiceData.detailedDescription}`;
                        const invoiceEmbedding = await getEmbedding(invoiceText);
                        await new DecisionEvent({
                            type: 'INVOICE',
                            content: { text: invoiceText, client: invoiceData.clientName, amount: invoiceData.amount },
                            embedding: invoiceEmbedding,
                            timestamp: new Date()
                        }).save();
                    }

                    return res.status(200).json({
                        answer: `I have generated the detailed invoice for ${invoiceData.clientName}. Your signature has been attached.`,
                        action: "download",
                        downloadUrl: pdfResult.downloadUrl,
                        sources: results
                    });
                }

                if (command.action === "financial_projection") {
                    const modelResult = await calculateProjection(command.data);
                    return res.status(200).json({ answer: modelResult.text, sources: results });
                }
            } catch (err) { console.error(err); }
        }

        // Normal Text Response
        res.status(200).json({ answer: aiResponse, sources: results });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "System Error" });
    }
};