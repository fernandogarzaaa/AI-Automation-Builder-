import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, inspect, approveLocally, deploy, deploymentStatus } from '../src/operations.mjs';
import { StateStore } from '../src/state.mjs';
import { ValidationError } from '../src/spec.mjs';

const spec = () => ({ version: 1, name: 'Example', description: 'Test', trigger: { type: 'manual' },
  actions: [{ id: 'notify', type: 'http', method: 'POST', url: 'https://httpbin.org/post' }] });
function environment(t) {
  const directory = mkdtempSync(join(tmpdir(), 'aab-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { AAB_STATE_PATH: join(directory, 'state.sqlite'), AAB_ALLOWED_ACTION_HOSTS: 'httpbin.org',
    N8N_BASE_URL: 'https://n8n.example.com', N8N_API_KEY: 'fixture-key' };
}
test('preview is inactive and refuses deploy without operator approval', async t => {
  const env = environment(t), p = prepare(spec(), 'n8n', env);
  assert.equal(inspect(p.previewId, env).approved, false);
  await assert.rejects(deploy(p.previewId, p.idempotencyKey, env), ValidationError);
  assert.equal(inspect(p.previewId, env).approved, false);
});
test('approved workflow creates once; identical retries return the stored result', async t => {
  const env = environment(t), p = prepare(spec(), 'n8n', env);
  approveLocally(p.previewId, env);
  let count = 0;
  const fetcher = async () => {
    count++;
    return { ok: true, text: async () => JSON.stringify({ id: 'flow123', name: 'Example' }) };
  };
  assert.equal((await deploy(p.previewId, p.idempotencyKey, env, fetcher)).status, 'created_inactive');
  assert.equal((await deploy(p.previewId, p.idempotencyKey, env, fetcher)).status, 'created_inactive');
  assert.equal(count, 1);
  assert.equal(deploymentStatus(p.idempotencyKey, env).workflowId, 'flow123');
  await assert.rejects(deploy(p.previewId, 'other-key-also-long-enough', env, fetcher), ValidationError);
});
test('network uncertainty cannot trigger automatic second create', async t => {
  const env = environment(t), p = prepare(spec(), 'n8n', env);
  approveLocally(p.previewId, env);
  let count = 0;
  const fetcher = async () => { count++; throw Error('socket dropped'); };
  assert.equal((await deploy(p.previewId, p.idempotencyKey, env, fetcher)).status, 'uncertain');
  assert.equal((await deploy(p.previewId, p.idempotencyKey, env, fetcher)).status, 'uncertain');
  assert.equal(count, 1);
});
test('preview survives separate process DB connections and rejects expired use', t => {
  const env = environment(t);
  let now = 100000;
  const first = new StateStore(env, () => now);
  const p = first.createPreview('n8n', spec());
  first.approve(p.previewId);
  first.close();
  const second = new StateStore(env, () => now + 1800001);
  assert.equal(second.preview(p.previewId).digest, p.fingerprint);
  assert.throws(() => second.claim(p.previewId, 'valid-length-key-123'), ValidationError);
  second.close();
});
test('invalid destination allowlist and unsupported provider fail closed', t => {
  const env = environment(t);
  assert.throws(() => prepare(spec(), 'make', env), ValidationError);
  assert.throws(() => prepare(spec(), 'n8n', { ...env, AAB_ALLOWED_ACTION_HOSTS: 'other.example.org' }), ValidationError);
});
