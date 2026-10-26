const Groq = require('groq-sdk');
const env = require('../config/env');

// Create the client lazily so a missing key never crashes the server at boot.
let groq = null;
function getGroqClient() {
  if (!env.groqApiKey) return null;
  if (!groq) groq = new Groq({ apiKey: env.groqApiKey });
  return groq;
}

// Use the smallest/fastest model to preserve daily token quota
const MODEL = 'llama-3.1-8b-instant';
const MAX_INPUT_CHARS = 400; // ~100 tokens — keep classification cheap
const FALLBACK = { summary: 'Auto-summary unavailable.', category: 'GENERAL', priority: 'LOW' };

/**
 * Classifies an incoming customer message using LLM logic.
 * Retries once on 429 (rate limit) after a short delay.
 *
 * @param {string} message - The raw text of the message.
 * @returns {Promise<{
 *   summary: string,
 *   category: 'URGENT' | 'PAYMENT' | 'GENERAL',
 *   priority: 'HIGH' | 'MEDIUM' | 'LOW'
 * }>}
 */
async function classifyMessage(message, retryCount = 0) {
  const client = getGroqClient();
  if (!client) return FALLBACK;

  try {
    // Truncate to save tokens
    const truncated = String(message || '').slice(0, MAX_INPUT_CHARS);

    const prompt = `Classify this business message. Reply ONLY with JSON.
MESSAGE: "${truncated}"
JSON: {"summary":"1 sentence","category":"URGENT|PAYMENT|GENERAL","priority":"HIGH|MEDIUM|LOW"}
Rules: PAYMENT if money/invoice mentioned. URGENT if time-sensitive.`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.1,
      max_tokens: 80,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return {
      summary:  result.summary  || 'No summary.',
      category: ['URGENT', 'PAYMENT', 'GENERAL'].includes(result.category) ? result.category : 'GENERAL',
      priority: ['HIGH', 'MEDIUM', 'LOW'].includes(result.priority) ? result.priority : 'LOW'
    };
  } catch (error) {
    // Retry once on 429 after waiting the suggested time
    if (error?.status === 429 && retryCount === 0) {
      const retryAfterMs = parseRetryAfter(error.message) || 5000;
      console.warn(`⚠️ Groq rate limit hit — retrying after ${retryAfterMs}ms...`);
      await new Promise(r => setTimeout(r, retryAfterMs));
      return classifyMessage(message, 1);
    }
    console.error('❌ AI Classification Error:', error.message);
    return FALLBACK;
  }
}

/**
 * Parse "Please try again in Xs" from Groq's error message.
 */
function parseRetryAfter(msg = '') {
  const match = msg.match(/try again in ([\d.]+)s/);
  return match ? Math.ceil(parseFloat(match[1])) * 1000 : null;
}

module.exports = { classifyMessage, getGroqClient, FALLBACK };
