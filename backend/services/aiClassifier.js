const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Classifies an incoming customer message using LLM logic.
 * 
 * @param {string} message - The raw text of the message.
 * @returns {Promise<{
 *   summary: string,
 *   category: 'URGENT' | 'PAYMENT' | 'GENERAL',
 *   priority: 'HIGH' | 'MEDIUM' | 'LOW'
 * }>}
 */
async function classifyMessage(message) {
    try {
        const prompt = `
        Analyze the following business message from a customer and provide a structured JSON response.
        MESSAGE: "${message}"

        JSON SCHEMA:
        {
            "summary": "A concise 1-sentence recap.",
            "category": ["URGENT", "PAYMENT", "GENERAL"],
            "priority": ["HIGH", "MEDIUM", "LOW"]
        }

        INSTRUCTIONS:
        1. If the message mentions money, bank transfers, payments, or invoices, set category to "PAYMENT".
        2. If the message implies time-sensitivity (e.g., "ASAP", "Hurry", "Delivery failed"), set category to "URGENT".
        3. Provide only the JSON.
        `;

        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
        
        return {
            summary: result.summary || 'Summary unavailable.',
            category: result.category || 'GENERAL',
            priority: result.priority || 'LOW'
        };
    } catch (error) {
        console.error('❌ AI Classification Error:', error.message);
        return {
            summary: 'Auto-summary failed.',
            category: 'GENERAL',
            priority: 'LOW'
        };
    }
}

module.exports = { classifyMessage };
