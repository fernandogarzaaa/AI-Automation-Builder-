#!/usr/bin/env node
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { planAutomation } from './planner.mjs';
import { providers } from './core.mjs';
import { prepare, inspect, deploy, deploymentStatus } from './operations.mjs';
import { ValidationError } from './spec.mjs';
import { safeError } from './security.mjs';

function send(res, status, value) {
  const payload = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
  });
  res.end(payload);
}

function authorized(req, token) {
  const candidate = req.headers.authorization;
  if (typeof candidate !== 'string' || !candidate.startsWith('Bearer ')) return false;
  const actual = Buffer.from(candidate.slice(7));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ValidationError('Content-Type must be application/json');
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString('utf8');
    if (Buffer.byteLength(text) > 65536) throw new ValidationError('Request exceeds 64 KiB');
  }
  try { return JSON.parse(text); } catch { throw new ValidationError('Invalid JSON body'); }
}

export function createApiServer(env = process.env) {
  const token = env.AAB_API_TOKEN;
  if (!token || token.length < 24) throw new ValidationError('Set AAB_API_TOKEN to at least 24 random characters');
  const hits = new Map();
  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true });
      if (!authorized(req, token)) return send(res, 401, { error: 'Unauthorized' });
      const ip = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const entry = hits.get(ip) || { since: now, count: 0 };
      if (now - entry.since > 60000) { entry.since = now; entry.count = 0; }
      entry.count++;
      hits.set(ip, entry);
      if (hits.size > 10000) hits.clear();
      if (entry.count > 60) return send(res, 429, { error: 'Rate limit exceeded' });
      if (req.method === 'GET' && req.url === '/v1/providers') return send(res, 200, providers());
      if (req.method === 'GET' && /^\/v1\/deployments\/[A-Za-z0-9._-]{12,128}$/.test(req.url)) return send(res, 200, deploymentStatus(req.url.split('/').at(-1), env));
      if (req.method === 'GET' && /^\/v1\/previews\/[0-9a-f-]{36}$/.test(req.url)) return send(res, 200, inspect(req.url.split('/').at(-1), env));
      if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });
      const body = await jsonBody(req);
      let output;
      switch (req.url) {
        case '/v1/plan': output = await planAutomation(body.prompt, env); break;
        case '/v1/preview': output = prepare(body.spec, body.provider || 'n8n', env); break;
        case '/v1/deploy':
          if ('approved' in body || 'activate' in body) throw new ValidationError('Boolean approval/activation is not accepted. Approve the preview locally, then deploy.');
          output = await deploy(body.previewId, body.idempotencyKey, env);
          break;
        default: return send(res, 404, { error: 'Not found' });
      }
      return send(res, 200, output);
    } catch (error) {
      return send(res, error instanceof ValidationError ? 400 : 502, { error: safeError(error) });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = createApiServer();
    const port = Number(process.env.AAB_API_PORT || 8787);
    const host = process.env.AAB_API_HOST || '127.0.0.1';
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ValidationError('Invalid API port');
    if (!['127.0.0.1', '::1', 'localhost'].includes(host) && process.env.AAB_REMOTE_API_EXPLICIT_OPT_IN !== 'true') throw new ValidationError('Public binding is blocked unless AAB_REMOTE_API_EXPLICIT_OPT_IN=true');
    server.listen(port, host, () => console.error('AAB API listening on ' + host + ':' + port));
  } catch (error) {
    console.error(safeError(error));
    process.exitCode = 1;
  }
}
