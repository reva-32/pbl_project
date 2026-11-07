const test = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_API_KEY = process.env.HINDSIGHT_API_KEY;
const ORIGINAL_BASE_URL = process.env.HINDSIGHT_BASE_URL;

function loadService() {
  delete require.cache[require.resolve('../services/hindsightService')];
  return require('../services/hindsightService');
}

function restoreEnv() {
  if (ORIGINAL_API_KEY === undefined) delete process.env.HINDSIGHT_API_KEY;
  else process.env.HINDSIGHT_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_BASE_URL === undefined) delete process.env.HINDSIGHT_BASE_URL;
  else process.env.HINDSIGHT_BASE_URL = ORIGINAL_BASE_URL;
  global.fetch = ORIGINAL_FETCH;
}

test.afterEach(restoreEnv);

test('derives stable bank IDs only from valid Mongo user IDs', () => {
  const service = loadService();
  assert.equal(service.getBankId('507f1f77bcf86cd799439011'), 'msme-507f1f77bcf86cd799439011');
  assert.throws(() => service.getBankId('another-business'), /valid authenticated user id/);
});

test('skips network calls when Hindsight is not configured', async () => {
  delete process.env.HINDSIGHT_API_KEY;
  let called = false;
  global.fetch = async () => { called = true; };
  const service = loadService();
  const result = await service.retainBusinessMemory('507f1f77bcf86cd799439011', 'Invoice paid');
  assert.equal(result.configured, false);
  assert.equal(called, false);
});

test('retains content in the authenticated user bank with source context', async () => {
  process.env.HINDSIGHT_API_KEY = 'test-key';
  process.env.HINDSIGHT_BASE_URL = 'https://hindsight.test/';
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ success: true, items_count: 1 }), { status: 200 });
  };

  const service = loadService();
  const result = await service.retainBusinessMemory(
    '507f1f77bcf86cd799439011',
    'Customer paid invoice INV-10',
    { source: 'invoice_paid' },
  );

  assert.equal(result.data.items_count, 1);
  assert.equal(request.url, 'https://hindsight.test/v1/default/banks/msme-507f1f77bcf86cd799439011/memories');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.options.body);
  assert.equal(body.items[0].content, 'Customer paid invoice INV-10');
  assert.equal(body.items[0].context, 'msme360:invoice_paid');
});

test('recalls only documented options and returns result list', async () => {
  process.env.HINDSIGHT_API_KEY = 'test-key';
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ results: [{ text: 'Supplier usually delivers in 3 days' }] }), { status: 200 });
  };

  const service = loadService();
  const results = await service.recallBusinessMemories(
    '507f1f77bcf86cd799439011',
    'supplier delivery history',
    { types: ['world', 'experience'], preferObservations: true },
  );
  assert.equal(results.length, 1);
  assert.deepEqual(requestBody, {
    query: 'supplier delivery history',
    types: ['world', 'experience'],
    prefer_observations: true,
  });
});

test('reflect returns the Hindsight response', async () => {
  process.env.HINDSIGHT_API_KEY = 'test-key';
  global.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).query, 'What recurring cash-flow risks exist?');
    return new Response(JSON.stringify({ text: 'Late customer payments recur.' }), { status: 200 });
  };
  const service = loadService();
  const result = await service.reflectOnBusinessMemory(
    '507f1f77bcf86cd799439011',
    'What recurring cash-flow risks exist?',
  );
  assert.equal(result.text, 'Late customer payments recur.');
});

test('surfaces API errors without exposing credentials', async () => {
  process.env.HINDSIGHT_API_KEY = 'secret-test-key';
  global.fetch = async () => new Response(JSON.stringify({ message: 'Invalid bank' }), { status: 401 });
  const service = loadService();
  await assert.rejects(
    service.recallBusinessMemories('507f1f77bcf86cd799439011', 'test'),
    /Invalid bank/,
  );
});

test('rejects non-JSON API responses', async () => {
  process.env.HINDSIGHT_API_KEY = 'test-key';
  global.fetch = async () => new Response('upstream proxy error', { status: 502 });
  const service = loadService();
  await assert.rejects(
    service.reflectOnBusinessMemory('507f1f77bcf86cd799439011', 'test'),
    /non-JSON response/,
  );
});
