// Shared RAG embedding service — singleton pattern so the model is
// loaded only once across all controllers that need embeddings.
const { pipeline } = require('@xenova/transformers');

let embedder = null;

/**
 * Generate a 384-dimensional sentence embedding for `text` using
 * the all-MiniLM-L6-v2 model (≈80 MB, downloaded on first call).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  if (!embedder) {
    console.log('⏳ Loading local embedding model (first time only)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const result = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

module.exports = { getEmbedding };
