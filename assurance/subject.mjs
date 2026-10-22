#!/usr/bin/env node
// SUT for Genesis. The gold labels are written independently in cases.jsonl.
// No secrets, no live provider calls, no AI calls, no mutations.
import { readFileSync } from 'node:fs';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { assertDeployPolicy } from '../src/security.mjs';
import { compileN8n } from '../src/n8n.mjs';

const task = JSON.parse(readFileSync(process.argv[2], 'utf8'));
try {
  const spec = validateSpec(task.input);
  assertDeployPolicy(spec, { AAB_ALLOWED_ACTION_HOSTS: 'httpbin.org,api.example.com' });
  const workflow = compileN8n(spec);
  if (workflow.nodes.length !== spec.actions.length + 1) throw new Error('Node count mismatch');
  if (Object.keys(workflow.connections).length !== spec.actions.length) throw new Error('Connection count mismatch');
  for (let i = 0; i < spec.actions.length; i++) {
    const actual = workflow.nodes[i+1];
    const expected = spec.actions[i];
    if (actual.parameters.url !== expected.url || actual.parameters.method !== expected.method) {
      throw new Error('Compiler did not preserve action');
    }
  }
  process.stdout.write(JSON.stringify({ label: 'accepted' }));
} catch (err) {
  if (!(err instanceof ValidationError)) {
    process.stderr.write(String(err) + '\n');
    process.exitCode = 2;
  } else {
    process.stdout.write(JSON.stringify({ label: 'rejected' }));
  }
}
