import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { previewAutomation, deployAutomation, providers } from '../src/core.mjs';
import { n8nBaseUrl } from '../src/security.mjs';
import { planAutomation } from '../src/planner.mjs';

const example = () => ({
  version: 1,
  name: 'Example notification',
  description: 'Post a message to a public API',
  trigger: { type: 'manual' },
  actions: [
    { id: 'send_notification', type: 'http', method: 'POST', url: 'https://httpbin.org/post', headers: { 'content-type': 'application/json' }, body: { hello: 'world' } },
  ],
});

test('validates a portable spec and compiles a connected n8n graph', () => {
  const result = previewAutomation(example());
  assert.equal(result.draft.nodes.length, 2);
  assert.equal(result.draft.nodes[1].type, 'n8n-nodes-base.httpRequest');
  assert.equal(result.draft.connections.Start.main[0][0].node, 'send_notification');
  assert.equal(result.draft.nodes[1].parameters.jsonBody, '{"hello":"world"}');
});

test('rejects unsafe URLs, secrets, expressions and unknown actions', () => {
  for (const url of ['http://example.com', 'https://127.0.0.1/', 'https://localhost/', 'https://service.internal/']) {
    const input = example();
    input.actions[0].url = url;
    assert.throws(() => validateSpec(input), ValidationError);
  }
  const secret = example();
  secret.actions[0].headers.Authorization = 'Bearer secret';
  assert.throws(() => validateSpec(secret), ValidationError);
  const expression = example();
  expression.actions[0].body = { command: '={{$json.token}}' };
  assert.throws(() => validateSpec(expression), ValidationError);
  const invalid = example();
  invalid.actions[0].type = 'shell';
  assert.throws(() => validateSpec(invalid), ValidationError);
});

test('deployment requires approval and explicit host allowlist', async () => {
  await assert.rejects(() => deployAutomation(example(), {}), ValidationError);
  await assert.rejects(() => deployAutomation(example(), { approved: true }, {}), ValidationError);
});

test('approved deployment creates a draft and never activates by default', async () => {
  const calls = [];
  const mockFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, text: async () => JSON.stringify({ id: 'workflow-123', name: 'Example notification' }) };
  };
  const env = {
    AAB_ALLOWED_ACTION_HOSTS: 'httpbin.org',
    N8N_BASE_URL: 'https://n8n.example.com',
    N8N_API_KEY: 'test-key',
  };
  const response = await deployAutomation(example(), { approved: true }, env, mockFetch);
  assert.equal(response.status, 'created_inactive');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/workflows$/);
  assert.equal(calls[0].init.headers['X-N8N-API-KEY'], 'test-key');
});

test('activation is an additional explicit opt-in', async () => {
  const urls = [];
  const mockFetch = async (url) => {
    urls.push(url);
    return { ok: true, text: async () => JSON.stringify({ id: 'flow123' }) };
  };
  const env = { AAB_ALLOWED_ACTION_HOSTS: 'httpbin.org', N8N_BASE_URL: 'https://n8n.example.com', N8N_API_KEY: 'x' };
  const result = await deployAutomation(example(), { approved: true, activate: true }, env, mockFetch);
  assert.equal(result.status, 'activated');
  assert.equal(urls.length, 2);
  assert.match(urls[1], /\/activate$/);
});

test('local n8n is opt-in only', () => {
  assert.throws(() => n8nBaseUrl({ N8N_BASE_URL: 'http://127.0.0.1:5678' }), ValidationError);
  assert.equal(n8nBaseUrl({ N8N_BASE_URL: 'http://127.0.0.1:5678', AAB_ALLOW_LOCAL_N8N: 'true' }), 'http://127.0.0.1:5678');
});

test('AI planner validates model output before it is used', async () => {
  const mockFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(example()) } }] }) });
  const result = await planAutomation('Send an HTTP request to https://httpbin.org/post', { AI_API_KEY: 'test', AI_MODEL: 'test-model' }, mockFetch);
  assert.equal(result.version, 1);
  assert.equal(result.actions.length, 1);
});

test('provider capability claims are explicit', () => {
  assert.equal(providers().find((p) => p.id === 'n8n').status, 'implemented');
  assert.equal(providers().find((p) => p.id === 'zapier').status, 'planned');
});
