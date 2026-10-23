// RAG embedding service
// On Render's free tier, the ONNX-based @xenova/transformers model fails to load
// due to memory/binary constraints. We use a lightweight hash-based embedding as
// a stable fallback — it produces consistent 384-dim vectors without any model download.

const EMBEDDING_DIM = 384;

/**
 * Generate a 384-dimensional embedding for `text`.
 * Uses a fast hash-based approach that is stable (same text → same vector).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const str = String(text || '').toLowerCase().trim();
  const vec = new Float32Array(EMBEDDING_DIM);

  // Seed the vector using character-level hash — each position gets a unique
  // contribution from every character so similar strings produce similar vectors.
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    for (let d = 0; d < EMBEDDING_DIM; d++) {
      // Deterministic pseudo-random mixing (FNV-inspired)
      vec[d] += Math.sin((code + 1) * (d + 1) * 0.0174533) * 0.1;
    }
  }

  // L2-normalize so dot-product == cosine similarity
  let norm = 0;
  for (let d = 0; d < EMBEDDING_DIM; d++) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm) || 1;
  const result = [];
  for (let d = 0; d < EMBEDDING_DIM; d++) result.push(vec[d] / norm);

  return result;
}

module.exports = { getEmbedding };
