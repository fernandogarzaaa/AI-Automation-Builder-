import { isIP } from 'node:net';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (message) => { throw new ValidationError(message); };
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, keys, label) => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(label + ': unsupported field ' + key);
};
const nonempty = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + ' must be nonempty text up to ' + max + ' characters');
  return value.trim();
};

export function publicHttpsUrl(input, label = 'URL') {
  let url;
  try { url = new URL(input); } catch { fail(label + ' must be an absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) fail(label + ' must be HTTPS without credentials or fragments');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIP(host) || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.test') || host.endsWith('.invalid') ||
      host.endsWith('.onion') || host === 'metadata.google.internal' ||
      !host.includes('.')) fail(label + ' has a blocked hostname');
  return url.toString();
}

function noExpressions(value) {
  if (typeof value === 'string') {
    if (value.includes('{{') || value.includes('}}') || value.startsWith('=')) fail('Provider expressions are not allowed in automation inputs');
  } else if (Array.isArray(value)) {
    value.forEach(noExpressions);
  } else if (record(value)) {
    for (const [key, child] of Object.entries(value)) {
      noExpressions(key);
      noExpressions(child);
    }
  }
}

export function validateSpec(input) {
  if (!record(input)) fail('Automation must be an object');
  const bytes = Buffer.byteLength(JSON.stringify(input) ?? '');
  if (bytes > 65536) fail('Automation exceeds 64 KiB');
  hasOnly(input, ['version', 'name', 'description', 'trigger', 'actions'], 'automation');
  if (![1, 2].includes(input.version)) fail('version must be 1 or 2');
  const name = nonempty(input.name, 100, 'name');
  const description = typeof input.description === 'string' && input.description.length <= 1000 ? input.description : fail('description must be text up to 1000 characters');
  const trigger = input.trigger;
  if (!record(trigger)) fail('trigger must be an object');
  if (!['manual', 'webhook', 'schedule'].includes(trigger.type)) fail('Unsupported trigger');
  hasOnly(trigger, ['type', 'path', 'cron'], 'trigger');
  if (trigger.type === 'webhook' && (typeof trigger.path !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(trigger.path))) fail('webhook path must be a lowercase slug of 3-64 characters');
  if (trigger.type === 'schedule' && (typeof trigger.cron !== 'string' || trigger.cron.split(/\s+/).length !== 5 || !/^[\d*\/,\-\s]+$/.test(trigger.cron))) fail('schedule requires a five-field cron expression');
  if (trigger.type !== 'webhook' && trigger.path !== undefined) fail('path is only valid for webhook triggers');
  if (trigger.type !== 'schedule' && trigger.cron !== undefined) fail('cron is only valid for schedule triggers');
  if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > 20) fail('actions must contain 1-20 steps');
  const ids = new Set();
  const actions = input.actions.map((action, index) => {
    if (!record(action)) fail('Action ' + index + ' must be an object');
    hasOnly(action, input.version === 2 ? ['id', 'type', 'method', 'url', 'headers', 'body', 'next'] : ['id', 'type', 'method', 'url', 'headers', 'body'], 'action ' + index);
    if (action.type !== 'http') fail('Only HTTP actions are supported in v0.1');
    if (typeof action.id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(action.id) || ids.has(action.id)) fail('Action IDs must be unique, lowercase, and 1-40 characters');
    ids.add(action.id);
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(action.method)) fail('Unsupported HTTP method');
    const url = publicHttpsUrl(action.url, 'action URL');
    if (action.headers !== undefined && !record(action.headers)) fail('headers must be an object');
    const headers = action.headers ?? {};
    if (Object.keys(headers).length > 12) fail('Too many headers');
    for (const [key, value] of Object.entries(headers)) {
      if (!/^[a-zA-Z0-9-]{1,60}$/.test(key) || /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key)$/i.test(key)) fail('Sensitive or invalid header name: ' + key);
      if (typeof value !== 'string' || value.length > 500 || /[\r\n]/.test(value)) fail('Invalid header value');
      noExpressions(value);
    }
    if (action.body !== undefined) {
      if (action.method === 'GET') fail('GET actions cannot have a body');
      const serialized = JSON.stringify(action.body);
      if (serialized === undefined || Buffer.byteLength(serialized) > 8192) fail('Body must be JSON up to 8 KiB');
      noExpressions(action.body);
    }
    if (input.version === 2 && action.next !== undefined && action.next !== null && (typeof action.next !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(action.next))) fail('Invalid next action ID');
    return { id: action.id, type: 'http', method: action.method, url, headers, ...(action.body === undefined ? {} : { body: action.body }), ...(input.version === 2 && action.next !== undefined ? { next: action.next } : {}) };
  });
  if (input.version === 2) {
    // When an edge is specified, all unspecified successors are terminals.
    // Without explicit edges, retain the v1 action-array order as a convenient
    // shorthand. This permits arbitrary action array order in explicit mode.
    const explicit = actions.some(action => Object.hasOwn(action, 'next'));
    const successors = new Map(actions.map((action, i) => [
      action.id,
      explicit ? (action.next ?? null) : (actions[i + 1]?.id ?? null),
    ]));
    const incoming = new Map(actions.map(action => [action.id, 0]));
    for (const destination of successors.values()) {
      if (destination === null) continue;
      if (!incoming.has(destination)) fail('Unknown next action ID');
      incoming.set(destination, incoming.get(destination) + 1);
      if (incoming.get(destination) > 1) fail('Multiple incoming edges are not supported');
    }
    const roots = actions.filter(action => incoming.get(action.id) === 0);
    if (roots.length !== 1) fail('Workflow graph must have exactly one entry');
    const seen = new Set();
    let current = roots[0].id;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      current = successors.get(current);
    }
    if (current !== null || seen.size !== actions.length) fail('Workflow graph must be acyclic and connected');
    actions.forEach(action => {
      const destination = successors.get(action.id);
      if (destination === null) delete action.next;
      else action.next = destination;
    });
  }
  return { version: input.version, name, description, trigger: { type: trigger.type, ...(trigger.path ? { path: trigger.path } : {}), ...(trigger.cron ? { cron: trigger.cron } : {}) }, actions };
}
