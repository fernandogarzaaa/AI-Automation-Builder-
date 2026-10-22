#!/usr/bin/env node
// Genesis subject: deterministic contract of the published AutomationSpec v1 validator.
// Reads task.input only; reference is held for the independent Genesis evaluator.
import { readFileSync } from 'node:fs';
import { validateSpec, ValidationError } from '../../src/spec.mjs';
import { assertDeployPolicy } from '../../src/security.mjs';

const file = process.argv[2];
if (!file) throw new Error('task_file argument is required');
const task = JSON.parse(readFileSync(file, 'utf8'));
if (!task.input || typeof task.input !== 'object') throw new Error('Missing evaluation input');
const { spec, allowedHosts } = task.input;
if (!Array.isArray(allowedHosts)) throw new Error('allowedHosts must be an array');
let accepted;
try {
  const validated = validateSpec(spec);
  assertDeployPolicy(validated, { AAB_ALLOWED_ACTION_HOSTS: allowedHosts.join(',') });
  accepted = true;
} catch (error) {
  if (!(error instanceof ValidationError)) throw error;
  accepted = false;
}
process.stdout.write(JSON.stringify(accepted));
