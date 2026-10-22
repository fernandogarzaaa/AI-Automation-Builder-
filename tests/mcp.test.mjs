import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('MCP stdio initializes in supported era and never exposes boolean approval', async t => {
  const child = spawn(process.execPath, ['src/mcp.mjs'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let buffer = '', requests = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let n;
    while ((n = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0,n); buffer = buffer.slice(n+1);
      let payload;
      try { payload = JSON.parse(line); } catch { continue; }
      const complete = requests.get(payload.id);
      if (complete) { requests.delete(payload.id); complete(payload); }
    }
  });
  let nextId = 0;
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { requests.delete(id); reject(Error('MCP timed out')); }, 5000);
    requests.set(id, reply => { clearTimeout(timer); resolve(reply); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const init = await request('initialize', { protocolVersion: '2026-07-28' });
  assert.equal(init.result.protocolVersion, '2025-11-25');
  const list = await request('tools/list');
  const names = list.result.tools.map(tool => tool.name);
  assert.ok(names.includes('automation_preview'));
  assert.ok(names.includes('automation_inspect'));
  assert.ok(names.includes('automation_status'));
  assert.equal(list.result.tools.find(tool => tool.name === 'automation_deploy').inputSchema.properties.approved, undefined);
});
