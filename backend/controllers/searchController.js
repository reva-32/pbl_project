const DecisionEvent = require('../models/DecisionEvent');
const User          = require('../models/user');
const Groq          = require('groq-sdk');
const { getEmbedding } = require('../services/ragService');
const { createInvoicePDF } = require('../utils/invoiceGenerator');
const { calculateProjection } = require('../utils/financialTools');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.searchEvents = async (req, res) => {
    try {
        const query = req.body.query;

        if (!query) return res.status(400).json({ error: 'Query required' });

        console.log(`🤔 User asks: "${query}"`);

        // ── Fetch User Profile for Personalization ───────────────────────────
        const profile = await User.findById(req.userId).select('ownerName companyName businessType');
        const ownerName = profile?.ownerName || 'Business Owner';
        const companyName = profile?.companyName || 'My Business';
        const businessType = profile?.businessType || 'MSME';

        const queryVector = await getEmbedding(query);
        const mongoose = require('mongoose');
        const results = await DecisionEvent.aggregate([
            {
                '$vectorSearch': {
                    'index': 'vector_index',
                    'path': 'embedding',
                    'queryVector': queryVector,
                    'numCandidates': 50,
                    'limit': 3,
                    'filter': { 'userId': new mongoose.Types.ObjectId(req.userId) }
                },
            },
            { '$project': { '_id': 0, 'type': 1, 'content': 1, 'status': 1, 'timestamp': 1 } },
        ]);

        const internalContext = results.length > 0
            ? results.map((doc) => `[${doc.type}]: ${JSON.stringify(doc.content)}`).join('\n')
            : 'EMPTY';

        const systemPrompt = `
        You are the elite AI Business Consultant for ${companyName}, owned by ${ownerName}.
        The business type is ${businessType}.
        INTERNAL RECORDS: ${internalContext}
        
        INSTRUCTIONS:
        1. **TASK: INVOICE**: If user wants an invoice, output JSON ONLY:
           { "action": "generate_invoice", "data": { "businessName": "${companyName}", "businessContact": "Contact", "ownerContact": "${ownerName}", "clientName": "Client", "amount": "100", "detailedDescription": "Desc" } }
           (Extract specific details from the query. Use "${companyName}" as the default businessName if not specified).
        
        2. **TASK: FINANCIAL**: Output JSON ONLY:
           { "action": "financial_projection", "data": { "currentRevenue": "100", "currentExpenses": "50", "revenueGrowth": "20", "expenseGrowth": "10" } }

        3. **GENERAL QUESTIONS**: Provide a highly detailed, precise, and professional answer on behalf of ${companyName}.
           - DO NOT ever apologize or mention "I couldn't find specific internal records". Just answer the question directly.
           - Use the INTERNAL RECORDS if relevant. If not, use your vast business knowledge.

        4. **FOLLOW-UPS (MANDATORY FOR TEXT ANSWERS)**: Always end your text response with 2 to 3 insightful follow-up questions for ${ownerName}. Format them as bullet points under the exact bold heading: "**Suggested Follow-ups:**".
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2,
            max_tokens: 1500,
        });

        const aiResponse = chatCompletion.choices[0]?.message?.content || '';

        // ── Action handler ────────────────────────────────────────────────────
        if (aiResponse.trim().startsWith('{')) {
            try {
                const command = JSON.parse(aiResponse);

                if (command.action === 'generate_invoice') {
                    console.log('⚡ Action: Invoice');
                    const invoiceData = {
                        ...command.data,
                        signaturePath: req.file ? req.file.path : null,
                    };
                    const pdfResult = await createInvoicePDF(invoiceData);

                    if (pdfResult.success) {
                        const invoiceText = `Invoice generated for ${invoiceData.clientName}. Amount: $${invoiceData.amount}. Description: ${invoiceData.detailedDescription}`;
                        const invoiceEmbedding = await getEmbedding(invoiceText);
                        await new DecisionEvent({
                            userId: req.userId,
                            type: 'INVOICE',
                            content: { text: invoiceText, client: invoiceData.clientName, amount: invoiceData.amount },
                            embedding: invoiceEmbedding,
                            timestamp: new Date(),
                        }).save();
                    }

                    // Construct the full URL including the backend host
                    const fullHost = `${req.protocol}://${req.get('host')}`;
                    const fullDownloadUrl = `${fullHost}${pdfResult.downloadUrl}`;

                    return res.status(200).json({
                        answer: `I have generated the detailed invoice for ${invoiceData.clientName}. Your signature has been attached.`,
                        action: 'download',
                        downloadUrl: fullDownloadUrl,
                        sources: results,
                    });
                }

                if (command.action === 'financial_projection') {
                    const modelResult = await calculateProjection(command.data);
                    return res.status(200).json({ answer: modelResult.text, sources: results });
                }
            } catch (err) {
                console.error('Action parse error:', err);
            }
        }

        // ── Normal text response ──────────────────────────────────────────────
        res.status(200).json({ answer: aiResponse, sources: results });

    } catch (error) {
        console.error('❌ Search Error:', error);
        res.status(500).json({ error: 'System Error' });
    }
};