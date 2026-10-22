import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { previewAutomation, providers } from '../src/core.mjs';
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
