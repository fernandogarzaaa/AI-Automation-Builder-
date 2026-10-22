import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { assertDeployPolicy } from '../src/security.mjs';

// Frozen, reviewed oracle labels are shared by the unit contract and Genesis.
// The subject under test NEVER reads the oracle reference field.
const corpus = readFileSync(new URL('../evaluations/automation-spec/cases.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => JSON.parse(line));

test('the frozen Genesis contract contains valid, invalid and unique cases', () => {
  assert.equal(corpus.length, 36);
  assert.equal(corpus.filter((c) => c.reference === true).length, 8);
  assert.equal(corpus.filter((c) => c.reference === false).length, 28);
  assert.equal(new Set(corpus.map((c) => c.id)).size, corpus.length);
});

for (const scenario of corpus) {
  test('AutomationSpec contract: ' + scenario.id, () => {
    const run = () => {
      const spec = validateSpec(scenario.input.spec);
      assertDeployPolicy(spec, { AAB_ALLOWED_ACTION_HOSTS: scenario.input.allowedHosts.join(',') });
    };
    if (scenario.reference) assert.doesNotThrow(run);
    else assert.throws(run, ValidationError);
  });
}
