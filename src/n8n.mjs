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
    if (spec.version === 1) connections[previous] = { main: [[{ node: node.name, type: 'main', index: 0 }]] };
    previous = node.name;
  });
  if (spec.version === 2) {
    const destinations = new Set(spec.actions.map(action => action.next).filter(Boolean));
    const root = spec.actions.find(action => !destinations.has(action.id));
    if (!root) throw new ValidationError('Workflow graph has no entry');
    connections[start.name] = { main: [[{ node: root.id, type: 'main', index: 0 }]] };
    for (const action of spec.actions) {
      if (action.next) connections[action.id] = { main: [[{ node: action.next, type: 'main', index: 0 }]] };
    }
  }
  return { name: spec.name, nodes, connections, settings: { executionOrder: 'v1' } };
}

export async function requestN8n(path, method, payload, env, fetcher) {
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

/**
 * Read back a created workflow and compare its material executable graph.
 * Provider-generated node IDs/metadata are intentionally ignored, while
 * action methods, URLs, headers, bodies, trigger parameters and connections
 * must remain byte-for-byte semantically equal.
 */
export async function verifyN8nWorkflow(id, spec, env = process.env, fetcher = fetch) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new ValidationError('Invalid workflow ID');
  const live = await requestN8n('/workflows/' + encodeURIComponent(id), 'GET', undefined, env, fetcher);
  const expected = compileN8n(spec);
  if (!Array.isArray(live.nodes) || !live.connections || typeof live.connections !== 'object') {
    throw new Error('n8n verification response lacks executable graph');
  }
  // Repeated names are ambiguous and would make n8n connection comparison unsafe.
  const expectedNodes = new Map(expected.nodes.map(node => [node.name, node]));
  const actualNodes = new Map(live.nodes.map(node => [node.name, node]));
  if (expectedNodes.size !== expected.nodes.length || actualNodes.size !== live.nodes.length ||
      actualNodes.size !== expectedNodes.size) throw new Error('n8n verification node set mismatch');
  for (const [name, wanted] of expectedNodes) {
    const got = actualNodes.get(name);
    if (!got || got.type !== wanted.type || got.typeVersion !== wanted.typeVersion ||
        JSON.stringify(got.parameters) !== JSON.stringify(wanted.parameters)) {
      throw new Error('n8n verification node mismatch: ' + name);
    }
  }
  if (JSON.stringify(live.connections) !== JSON.stringify(expected.connections)) {
    throw new Error('n8n verification connections mismatch');
  }
  // Always require inactive. A provider default that activates new workflows
  // would violate the explicit human-activation boundary.
  if (live.active !== false) throw new Error('n8n verification requires an inactive workflow');
  return { id, status: 'verified_inactive', nodes: actualNodes.size };
}
