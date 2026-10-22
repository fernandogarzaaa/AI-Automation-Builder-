#!/usr/bin/env node
// Independent fail-closed assertion on Genesis evidence, including a negative control.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2];
if (!directory) throw new Error('Usage: node check-genesis-results.mjs <trust-bundle-dir>');
function json(...parts) { return JSON.parse(readFileSync(join(directory, ...parts), 'utf8')); }
const gate = json('gate.json');
const system = json('evaluation', 'verdict.json');
const treatment = json('evaluation','treatment','metrics.json');
const baseline = json('evaluation','baseline','metrics.json');
const assurance = json('assurance.json');
const metric = (rows,key) => rows.find(r => r.metric === key)?.value;
if (gate.decision !== 'RELEASE') throw new Error('Genesis blocked promotion: ' + gate.decision);
if (system.verdict !== 'SUPPORTED') throw new Error('Policy claim was not supported: ' + system.verdict);
if (assurance.verdict !== 'SOUND' || assurance.controls < 1 || assurance.must_rejects < 1) {
  throw new Error('Evaluator was not assured with both control and adversarial probes');
}
if (metric(treatment,'accuracy') !== 1) throw new Error('Treatment did not achieve 100% on registered policy cases');
const baseScore = metric(baseline,'accuracy');
if (typeof baseScore !== 'number' || baseScore > 0.5) {
  throw new Error('Negative-control baseline scored too well or could not be measured: ' + baseScore);
}
console.log('Genesis policy gate:',gate.decision,'treatment_accuracy:',metric(treatment,'accuracy'),
  'negative_control_accuracy:',baseScore,'assurance:',assurance.verdict);
