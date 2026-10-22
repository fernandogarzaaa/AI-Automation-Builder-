#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { planAutomation } from './planner.mjs';
import { previewAutomation, deployAutomation, providers } from './core.mjs';
import { safeError } from './security.mjs';

async function readSpec(path) {
  if (!path) throw new Error('Missing spec JSON file path');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let value;
  switch (command) {
    case 'providers': value = providers(); break;
    case 'plan': value = await planAutomation(args.join(' ')); break;
    case 'preview': value = previewAutomation(await readSpec(args[0])); break;
    case 'deploy':
      value = await deployAutomation(await readSpec(args[0]), {
        approved: args.includes('--approve'),
        activate: args.includes('--activate'),
      });
      break;
    default:
      process.stderr.write('Usage: node src/cli.mjs providers | plan "request" | preview spec.json | deploy spec.json --approve [--activate]\n');
      process.exitCode = 2;
      return;
  }
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

main().catch((error) => {
  process.stderr.write(safeError(error) + '\n');
  process.exitCode = 1;
});
