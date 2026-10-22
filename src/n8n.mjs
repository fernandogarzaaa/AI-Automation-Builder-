import { createHash } from 'node:crypto';
import { n8nBaseUrl } from './security.mjs';
import { ValidationError } from './spec.mjs';

const stableId = (value) => createHash('sha256').update(value).digest('hex').slice(0, 24);

export function compileN8n(spec) {
  const trigger = spec.trigger;
  const start = {
    id: stableId(spec.name + ':trigger'),
    name: 'Start',
    position: [240, 300],
    ...(trigger.type === 'manual'
      ? { type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, parameters: {} }
      : trigger.type === 'webhook'
        ? {
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            webhookId: stableId(spec.name + ':' + trigger.path),
            parameters: { httpMethod: 'POST', path: trigger.path, responseMode: 'onReceived', options: {} },
          }
        : {
            type: 'n8n-nodes-base.scheduleTrigger',
            typeVersion: 1.2,
            parameters: { rule: { interval: [{ field: 'cronExpression', expression: trigger.cron }] } },
          }),
  };
  const nodes = [start];
  const connections = {};
  let previous = start.name;
  spec.actions.forEach((action, index) => {
    const parameters = {
      method: action.method,
      url: action.url,
      sendHeaders: Object.keys(action.headers).length > 0,
      options: { timeout: 15000 },
    };
    if (parameters.sendHeaders) {
      parameters.headerParameters = { parameters: Object.entries(action.headers).map(([name, value]) => ({ name, value })) };
    }
    if (action.body !== undefined) {
      parameters.sendBody = true;
      parameters.contentType = 'json';
      parameters.specifyBody = 'json';
      parameters.jsonBody = JSON.stringify(action.body);
    }
    const node = {
      id: stableId(spec.name + ':' + action.id),
      name: action.id,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [480 + index * 240, 300],
      parameters,
    };
    nodes.push(node);
    connections[previous] = { main: [[{ node: node.name, type: 'main', index: 0 }]] };
    previous = node.name;
  });
  return { name: spec.name, nodes, connections, settings: { executionOrder: 'v1' } };
}

async function requestN8n(path, method, payload, env, fetcher) {
  const base = n8nBaseUrl(env).replace(/\/api\/v1\/?$/, '');
  if (!env.N8N_API_KEY) throw new ValidationError('N8N_API_KEY is required');
  const response = await fetcher(base + '/api/v1' + path, {
    method,
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = (await response.text()).slice(0, 100000);
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) throw new Error('n8n API request failed with HTTP ' + response.status);
  return data;
}

export async function createN8nWorkflow(spec, env = process.env, fetcher = fetch) {
  const data = await requestN8n('/workflows', 'POST', compileN8n(spec), env, fetcher);
  if (!data.id || !/^[a-zA-Z0-9_-]+$/.test(String(data.id))) throw new Error('n8n did not return a valid workflow ID');
  return { id: String(data.id), name: data.name || spec.name, status: 'created_inactive' };
}

export async function activateN8nWorkflow(id, env = process.env, fetcher = fetch) {
  await requestN8n('/workflows/' + encodeURIComponent(id) + '/activate', 'POST', undefined, env, fetcher);
  return { id, status: 'activated' };
}
