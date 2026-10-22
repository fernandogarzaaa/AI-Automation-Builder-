import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Genesis registration contains independently labeled positive and negative controls', (t) => {
  const lines = readFileSync('assurance/cases.jsonl', 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 30);
  const cases = lines.map(line => JSON.parse(line));
  assert.equal(cases.filter(c => c.reference === 'accepted').length, 12);
  assert.equal(cases.filter(c => c.reference === 'rejected').length, 18);
  assert.equal(new Set(cases.map(c => c.id)).size, 30);
  const directory = mkdtempSync(join(tmpdir(), 'aab-genesis-cases-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const taskFile = join(directory, 'task.json');
  for (const item of cases) {
    writeFileSync(taskFile, JSON.stringify(item), 'utf8');
    const candidate = spawnSync(process.execPath, ['assurance/subject.mjs', taskFile], { encoding: 'utf8', timeout: 5000 });
    assert.equal(candidate.status, 0, 'subject errored on ' + item.id + ': ' + candidate.stderr);
    assert.equal(JSON.parse(candidate.stdout).label, item.reference, 'independent gold mismatch: ' + item.id);
  }
});
