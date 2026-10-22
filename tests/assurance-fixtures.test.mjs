import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { assertDeployPolicy } from '../src/security.mjs';
import { compileN8n } from '../src/n8n.mjs';

const fixture = readFileSync('assurance/cases.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
test('Genesis suite registers independent positive and negative controls', () => {
  assert.equal(fixture.length, 30);
  assert.equal(fixture.filter(c => c.reference === 'accepted').length, 12);
  assert.equal(fixture.filter(c => c.reference === 'rejected').length, 18);
  assert.equal(new Set(fixture.map(c => c.id)).size, 30);
});
for (const item of fixture) {
  test('policy contract: ' + item.id, () => {
    let observed = 'accepted';
    try {
      const spec = validateSpec(item.input);
      assertDeployPolicy(spec, { AAB_ALLOWED_ACTION_HOSTS: 'httpbin.org,api.example.com' });
      const workflow = compileN8n(spec);
      assert.equal(workflow.nodes.length, spec.actions.length + 1);
      assert.equal(Object.keys(workflow.connections).length, spec.actions.length);
      for (let i = 0; i < spec.actions.length; i++) {
        assert.equal(workflow.nodes[i+1].parameters.url, spec.actions[i].url);
        assert.equal(workflow.nodes[i+1].parameters.method, spec.actions[i].method);
      }
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      observed = 'rejected';
    }
    assert.equal(observed, item.reference, 'Gold mismatch for ' + item.id);
  });
}
