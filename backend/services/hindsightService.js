const DEFAULT_BASE_URL = 'https://api.hindsight.vectorize.io';
const REQUEST_TIMEOUT_MS = 10000;

function getConfig() {
  const apiKey = process.env.HINDSIGHT_API_KEY;
  const baseUrl = (process.env.HINDSIGHT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  if (!apiKey) return null;
  return { apiKey, baseUrl };
}

function getBankId(userId) {
  // userId comes only from the verified JWT middleware, never from request input.
  const normalizedId = String(userId || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(normalizedId)) {
    throw new Error('A valid authenticated user id is required for Hindsight memory isolation.');
  }
  return `msme-${normalizedId.toLowerCase()}`;
}

async function hindsightRequest(path, { method = 'GET', body } = {}) {
  const config = getConfig();
  if (!config) return { configured: false, data: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let data = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('Hindsight returned a non-JSON response.');
      }
    }

    if (!response.ok) {
      const error = new Error(data?.detail?.[0]?.msg || data?.message || `Hindsight request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }

    return { configured: true, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function retainBusinessMemory(userId, content, metadata = {}) {
  const bankId = getBankId(userId);
  if (typeof content !== 'string' || !content.trim()) return { skipped: true };

  return hindsightRequest(`/v1/default/banks/${encodeURIComponent(bankId)}/memories`, {
    method: 'POST',
    body: {
      items: [{
        content: content.trim().slice(0, 12000),
        context: `msme360:${String(metadata.source || 'business_event').slice(0, 80)}`,
        timestamp: metadata.timestamp || new Date().toISOString(),
        ...(typeof metadata.documentId === 'string' && metadata.documentId.trim()
          ? { document_id: metadata.documentId.trim().slice(0, 200) }
          : {}),
      }],
    },
  });
}

async function recallBusinessMemories(userId, query, options = {}) {
  const bankId = getBankId(userId);
  if (typeof query !== 'string' || !query.trim()) return [];

  const result = await hindsightRequest(`/v1/default/banks/${encodeURIComponent(bankId)}/memories/recall`, {
    method: 'POST',
    body: {
      query: query.trim().slice(0, 2000),
      ...(Array.isArray(options.types) ? { types: options.types } : {}),
      ...(typeof options.preferObservations === 'boolean' ? { prefer_observations: options.preferObservations } : {}),
    },
  });

  return result.configured && Array.isArray(result.data?.results) ? result.data.results : [];
}

async function reflectOnBusinessMemory(userId, query) {
  const bankId = getBankId(userId);
  if (typeof query !== 'string' || !query.trim()) return null;

  const result = await hindsightRequest(`/v1/default/banks/${encodeURIComponent(bankId)}/reflect`, {
    method: 'POST',
    body: {
      query: query.trim().slice(0, 2000),
      max_tokens: 700,
      include: { facts: {} },
    },
  });

  // The documented response's primary answer is "text". Reject malformed payloads.
  if (!result.configured || typeof result.data?.text !== 'string' || !result.data.text.trim()) {
    return null;
  }

  const memories = Array.isArray(result.data.memories)
    ? result.data.memories
    : Array.isArray(result.data.based_on?.memories)
      ? result.data.based_on.memories
      : [];

  return {
    text: result.data.text.trim().slice(0, 6000),
    memories: memories
      .filter((memory) => memory && typeof memory.text === 'string' && memory.text.trim())
      .slice(0, 8)
      .map((memory) => ({
        text: memory.text.trim().slice(0, 500),
        type: typeof memory.type === 'string' ? memory.type : 'memory',
      })),
  };
}

// Reflect is more expensive than Recall, so reserve it for questions that ask
// for synthesis across business history rather than ordinary factual lookups.
function isStrategicBusinessQuery(query) {
  if (typeof query !== 'string' || query.trim().length < 12) return false;
  return /\\b(trend|trends|pattern|patterns|recurr(?:ing|ently)|over time|histor(?:y|ical)|performance|analyse|analyze|analysis|insight|insights|recommend(?:ation|ations|ed)?|improv(?:e|ement|ements)|risk|risks|cash.?flow|profitabilit|vendor performance|supplier performance|customer behavio[u]?r|compare.*period|business health|what should i focus|strateg(?:y|ic))\\b/i.test(query);
}

module.exports = {
  getBankId,
  retainBusinessMemory,
  recallBusinessMemories,
  reflectOnBusinessMemory,
  isStrategicBusinessQuery,
};
