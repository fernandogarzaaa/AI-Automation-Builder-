#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { planAutomation } from './planner.mjs';
import { previewAutomation, providers } from './core.mjs';
import { prepare, inspect, approveLocally, deploy, deploymentStatus } from './operations.mjs';
import { safeError } from './security.mjs';
import { ValidationError } from './spec.mjs';

async function readSpec(path) {
  if (!path) throw new ValidationError('Missing spec JSON file path');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function askApproval(summary) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new ValidationError('Local approval requires an interactive terminal');
  process.stdout.write(summary + '\n');
  const challenge = randomBytes(4).toString('hex');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question('Type ' + challenge + ' to confirm approval (anything else cancels): ');
    if (answer.trim() !== challenge) throw new ValidationError('Approval cancelled');
  } finally { prompt.close(); }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let output;
  switch (command) {
    case 'providers': output = providers(); break;
    case 'plan': output = await planAutomation(args.join(' ')); break;
    case 'compile': output = previewAutomation(await readSpec(args[0])); break;
    case 'preview': output = prepare(await readSpec(args[0])); break;
    case 'inspect': output = inspect(args[0]); break;
    case 'approve': {
      const preview = inspect(args[0]);
      if (preview.approved) { output = { previewId: preview.previewId, approved: true, alreadyApproved: true }; break; }
      const steps = preview.spec.actions.map((action) => action.method + ' ' + new URL(action.url).hostname).join('\n  ');
      await askApproval('Approval requested for ' + preview.spec.name + '\nProvider: ' + preview.provider +
        '\nFingerprint: ' + preview.fingerprint + '\nExpires: ' + preview.expiresAt + '\n  ' + steps +
        '\nReview the preview in detail before confirming. This permits only INACTIVE workflow creation.');
      output = approveLocally(args[0]);
      break;
    }
    case 'deploy': output = await deploy(args[0], args[1]); break;
    case 'status': output = deploymentStatus(args[0]); break;
    default:
      process.stderr.write('Usage: ai-automation-builder providers | plan "request" | compile spec.json | preview spec.json | inspect PREVIEW_ID | approve PREVIEW_ID | deploy PREVIEW_ID IDEMPOTENCY_KEY | status IDEMPOTENCY_KEY\n');
      process.exitCode = 2;
      return;
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((error) => {
  process.stderr.write(safeError(error) + '\n');
  process.exitCode = 1;
});
