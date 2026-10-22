import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApiServer } from '../src/api.mjs';

test('HTTP API requires bearer auth and exposes health and providers', async () => {
  const token = 'a-very-long-random-token-for-tests';
  const server = createApiServer({ AAB_API_TOKEN: token });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    const denied = await fetch(base + '/v1/providers');
    assert.equal(denied.status, 401);
    const allowed = await fetch(base + '/v1/providers', { headers: { authorization: 'Bearer ' + token } });
    assert.equal(allowed.status, 200);
    const providers = await allowed.json();
    assert.equal(providers[0].id, 'n8n');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
