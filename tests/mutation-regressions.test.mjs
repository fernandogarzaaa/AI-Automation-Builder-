import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, publicHttpsUrl, validateSpec } from '../src/spec.mjs';
import { allowedHosts, assertDeployPolicy, n8nBaseUrl, safeError } from '../src/security.mjs';

const base = () => ({
  version: 1,
  name: ' Example name ',
  description: 'Valid automation',
  trigger: { type: 'manual' },
  actions: [{
    id: 'send',
    type: 'http',
    method: 'POST',
    url: 'https://api.example.com/events',
    headers: { 'content-type': 'application/json' },
    body: { message: 'hello' },
  }],
});
const changed = (change) => { const value = base(); change(value); return value; };
function invalid(name, value, error) {
  test(name, () => assert.throws(() => validateSpec(value), { name: 'ValidationError', message: error }));
}
function good(name, value, check = () => {}) {
  test(name, () => check(validateSpec(value)));
}

test('ValidationError keeps stable type and error name', () => {
  const e = new ValidationError('bad input');
  assert.equal(e.name, 'ValidationError');
  assert.equal(e.message, 'bad input');
  assert.ok(e instanceof Error);
});
test('normalization trims a legitimate name and retains expected fields', () => {
  const output = validateSpec(base());
  assert.equal(output.name, 'Example name');
  assert.equal(output.version, 1);
  assert.equal(output.actions.length, 1);
  assert.equal(output.actions[0].url, 'https://api.example.com/events');
  assert.equal(output.actions[0].headers['content-type'], 'application/json');
  assert.deepEqual(output.actions[0].body, { message: 'hello' });
  assert.deepEqual(output.trigger, { type: 'manual' });
});
invalid('null automation', null, /Automation must be an object/);
invalid('array automation', [], /Automation must be an object/);
invalid('string automation', 'hi', /Automation must be an object/);
invalid('unnamed automation', changed(s => { s.name = ''; }), /name must be nonempty text up to 100 characters/);
invalid('nonnumeric name', changed(s => { s.name = 12; }), /name must be nonempty text up to 100 characters/);
invalid('too-long name', changed(s => { s.name = 'a'.repeat(101); }), /name must be nonempty text up to 100 characters/);
good('name of exactly 100 characters', changed(s => { s.name = 'a'.repeat(100); }), r => assert.equal(r.name.length, 100));
invalid('description too long', changed(s => { s.description = 'a'.repeat(1001); }), /description must be text up to 1000 characters/);
invalid('description not string', changed(s => { s.description = null; }), /description must be text up to 1000 characters/);
good('description exactly 1000 chars', changed(s => { s.description = 'a'.repeat(1000); }));
invalid('wrong version', changed(s => { s.version = 3; }), /version must be 1 or 2/);
invalid('unsupported top-level property names the property', changed(s => { s.evil = true; }), /automation: unsupported field evil/);
invalid('nonobject trigger', changed(s => { s.trigger = null; }), /trigger must be an object/);
invalid('array trigger', changed(s => { s.trigger = []; }), /trigger must be an object/);
invalid('unknown trigger name', changed(s => { s.trigger = { type: 'watch' }; }), /Unsupported trigger/);
invalid('unknown trigger property', changed(s => { s.trigger = { type: 'manual', extra: true }; }), /trigger: unsupported field extra/);
invalid('webhook path missing', changed(s => { s.trigger = { type: 'webhook' }; }), /webhook path must be a lowercase slug of 3-64 characters/);
invalid('webhook path too short', changed(s => { s.trigger = { type: 'webhook', path: 'ab' }; }), /webhook path must be a lowercase slug of 3-64 characters/);
invalid('webhook uppercase', changed(s => { s.trigger = { type: 'webhook', path: 'Hello' }; }), /webhook path must be a lowercase slug of 3-64 characters/);
invalid('webhook path too long', changed(s => { s.trigger = { type: 'webhook', path: 'a'.repeat(65) }; }), /webhook path must be a lowercase slug of 3-64 characters/);
good('webhook path minimum of 3', changed(s => { s.trigger = { type: 'webhook', path: 'abc' }; }), r => assert.equal(r.trigger.path, 'abc'));
good('webhook path exactly 64', changed(s => { s.trigger = { type: 'webhook', path: 'a'.repeat(64) }; }));
invalid('schedule expression missing', changed(s => { s.trigger = { type: 'schedule' }; }), /schedule requires a five-field cron expression/);
invalid('schedule expression too few fields', changed(s => { s.trigger = { type: 'schedule', cron: '0 12 * *' }; }), /schedule requires a five-field cron expression/);
invalid('schedule expression nonnumeric text', changed(s => { s.trigger = { type: 'schedule', cron: 'a b c d e' }; }), /schedule requires a five-field cron expression/);
good('schedule expression 5 fields', changed(s => { s.trigger = { type: 'schedule', cron: '0 0 * * *' }; }), r => assert.equal(r.trigger.cron, '0 0 * * *'));
invalid('manual trigger with webhook path', changed(s => { s.trigger.path = 'abc'; }), /path is only valid for webhook triggers/);
invalid('manual trigger with cron', changed(s => { s.trigger.cron = '0 0 * * *'; }), /cron is only valid for schedule triggers/);
invalid('action list missing', changed(s => { delete s.actions; }), /actions must contain 1-20 steps/);
invalid('action list not array', changed(s => { s.actions = {}; }), /actions must contain 1-20 steps/);
invalid('action list too big', changed(s => { s.actions = Array.from({ length: 21 }, (_, i) => ({ id: 'a' + i, type: 'http', method: 'GET', url: 'https://api.example.com' })); }), /actions must contain 1-20 steps/);
good('20 supported actions', changed(s => { s.actions = Array.from({ length: 20 }, (_, i) => ({ id: 'a' + i, type: 'http', method: 'GET', url: 'https://api.example.com' })); }), r => assert.equal(r.actions.length, 20));
invalid('action cannot be null', changed(s => { s.actions = [null]; }), /Action 0 must be an object/);
invalid('action cannot be an array', changed(s => { s.actions = [[]]; }), /Action 0 must be an object/);
invalid('action unknown field', changed(s => { s.actions[0].process = 'shell'; }), /action 0: unsupported field process/);
invalid('action type is HTTP only', changed(s => { s.actions[0].type = 'shell'; }), /Only HTTP actions are supported/);
invalid('action ID required', changed(s => { delete s.actions[0].id; }), /Action IDs must be unique/);
invalid('action ID uppercase', changed(s => { s.actions[0].id = 'Send'; }), /Action IDs must be unique/);
invalid('action ID cannot start numeric', changed(s => { s.actions[0].id = '2send'; }), /Action IDs must be unique/);
invalid('action ID over 40 chars', changed(s => { s.actions[0].id = 'a'.repeat(41); }), /Action IDs must be unique/);
good('action ID exactly 40 chars', changed(s => { s.actions[0].id = 'a'.repeat(40); }), r => assert.equal(r.actions[0].id.length, 40));
invalid('duplicate action IDs', changed(s => { s.actions.push({ ...s.actions[0] }); }), /Action IDs must be unique/);
invalid('unknown method', changed(s => { s.actions[0].method = 'EXEC'; }), /Unsupported HTTP method/);
for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  good('HTTP method supported: ' + method, changed(s => {
    s.actions[0].method = method;
    if (method === 'GET') delete s.actions[0].body;
  }), r => assert.equal(r.actions[0].method, method));
}
invalid('GET body denied', changed(s => { s.actions[0].method = 'GET'; }), /GET actions cannot have a body/);
invalid('headers cannot be null', changed(s => { s.actions[0].headers = null; }), /headers must be an object/);
invalid('headers cannot be array', changed(s => { s.actions[0].headers = []; }), /headers must be an object/);
invalid('headers limit 12', changed(s => { s.actions[0].headers = Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['h' + i, 'v'])); }), /Too many headers/);
good('headers 12 allowed', changed(s => { s.actions[0].headers = Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['h' + i, 'v'])); }));
for (const blocked of ['authorization', 'Authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-api-key']) {
  invalid('secret header denied: ' + blocked, changed(s => { s.actions[0].headers = { [blocked]: 'secret' }; }), /Sensitive or invalid header name/);
}
invalid('invalid header punctuation', changed(s => { s.actions[0].headers = { 'x_meta': 'v' }; }), /Sensitive or invalid header name/);
invalid('header too-long name', changed(s => { s.actions[0].headers = { ['a'.repeat(61)]: 'v' }; }), /Sensitive or invalid header name/);
invalid('invalid header numeric value', changed(s => { s.actions[0].headers = { 'x-test': 5 }; }), /Invalid header value/);
invalid('header value 501 chars', changed(s => { s.actions[0].headers = { 'x-test': 'a'.repeat(501) }; }), /Invalid header value/);
invalid('header newline injection', changed(s => { s.actions[0].headers = { 'x-test': 'ok\nInjected: yes' }; }), /Invalid header value/);
good('header value exactly 500 chars', changed(s => { s.actions[0].headers = { 'x-test': 'a'.repeat(500) }; }));
invalid('body expression starts with equal', changed(s => { s.actions[0].body = { v: '={{$json.secret}}' }; }), /Provider expressions are not allowed/);
invalid('body expression closing braces', changed(s => { s.actions[0].body = { v: 'secret }}' }; }), /Provider expressions are not allowed/);
invalid('body expression opening braces', changed(s => { s.actions[0].body = { v: 'secret {{' }; }), /Provider expressions are not allowed/);
invalid('nested object expression', changed(s => { s.actions[0].body = { a: { b: '{{x}}' } }; }), /Provider expressions are not allowed/);
invalid('nested array expression', changed(s => { s.actions[0].body = [0, { a: ['hello', { b: '=x' }] }]; }), /Provider expressions are not allowed/);
invalid('expression in JSON key', changed(s => { s.actions[0].body = { ['{{x}}']: 'value' }; }), /Provider expressions are not allowed/);
invalid('header expression', changed(s => { s.actions[0].headers = { 'x-key': '={{x}}' }; }), /Provider expressions are not allowed/);
good('ordinary trailing equal is allowed', changed(s => { s.actions[0].body = { token: 'safe=' }; }));
invalid('body exceeds 8192 JSON bytes', changed(s => { s.actions[0].body = { x: 'a'.repeat(8192) }; }), /Body must be JSON up to 8 KiB/);
good('undefined body is omitted', changed(s => { s.actions[0].body = undefined; s.actions[0].method = 'PATCH'; }), r => assert.equal('body' in r.actions[0], false));
invalid('total payload exceeds 65536 bytes', changed(s => {
  s.actions = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, type: 'http', method: 'POST', url: 'https://api.example.com/post', body: { x: 'q'.repeat(8000) } }));
}), /Automation exceeds 64 KiB/);

const urlCases = [
  ['http disallowed', 'http://api.example.com/path', /must be HTTPS without credentials or fragments/],
  ['embedded username disallowed', 'https://bob@api.example.com/path', /must be HTTPS without credentials or fragments/],
  ['embedded password disallowed', 'https://bob:secret@api.example.com/path', /must be HTTPS without credentials or fragments/],
  ['fragment disallowed', 'https://api.example.com/path#part', /must be HTTPS without credentials or fragments/],
  ['loopback IP disallowed', 'https://127.0.0.1/path', /has a blocked hostname/],
  ['localhost disallowed', 'https://localhost/path', /has a blocked hostname/],
  ['localhost subdomain disallowed', 'https://host.localhost/path', /has a blocked hostname/],
  ['local domain disallowed', 'https://admin.local/path', /has a blocked hostname/],
  ['internal domain disallowed', 'https://service.internal/path', /has a blocked hostname/],
  ['test domain disallowed', 'https://unit.test/path', /has a blocked hostname/],
  ['invalid domain disallowed', 'https://unit.invalid/path', /has a blocked hostname/],
  ['onion domain disallowed', 'https://edge.onion/path', /has a blocked hostname/],
  ['metadata host disallowed', 'https://metadata.google.internal/path', /has a blocked hostname/],
  ['single-label host disallowed', 'https://intranet/path', /has a blocked hostname/],
];
for (const [name, url, pattern] of urlCases) {
  test('publicHttpsUrl: ' + name, () => assert.throws(() => publicHttpsUrl(url), { name: 'ValidationError', message: pattern }));
}
test('publicHttpsUrl rejects a malformed absolute URL', () => {
  assert.throws(() => publicHttpsUrl('not a URL', 'target'), { name: 'ValidationError', message: /target must be an absolute URL/ });
});
test('publicHttpsUrl normalizes a legitimate HTTPS endpoint', () => {
  assert.equal(publicHttpsUrl('https://API.EXAMPLE.COM/a?q=1'), 'https://api.example.com/a?q=1');
});

test('allowedHosts normalizes whitespace and case, ignores empty entries', () => {
  assert.deepEqual([...allowedHosts({ AAB_ALLOWED_ACTION_HOSTS: ' A.EXAMPLE.COM, ,api.example.com ,B.example.org' })].sort(), ['a.example.com', 'api.example.com', 'b.example.org']);
  assert.deepEqual([...allowedHosts({})], []);
});
test('assertDeployPolicy requires a non-empty allowlist', () => {
  assert.throws(() => assertDeployPolicy(validateSpec(base()), {}), { name: 'ValidationError', message: /Set AAB_ALLOWED_ACTION_HOSTS before deployment/ });
});
test('assertDeployPolicy forbids an unlisted public host', () => {
  const s = validateSpec(base());
  assert.throws(() => assertDeployPolicy(s, { AAB_ALLOWED_ACTION_HOSTS: 'other.example.com' }), { name: 'ValidationError', message: /Action host is not allowlisted: api.example.com/ });
});
test('assertDeployPolicy checks every step, not just the first', () => {
  const s = validateSpec(changed(x => { x.actions.push({ id: 'other', type: 'http', method: 'GET', url: 'https://other.example.org/path' }); }));
  assert.throws(() => assertDeployPolicy(s, { AAB_ALLOWED_ACTION_HOSTS: 'api.example.com' }), { name: 'ValidationError', message: /other.example.org/ });
});
test('assertDeployPolicy accepts every explicitly allowed action host', () => {
  const s = validateSpec(changed(x => { x.actions.push({ id: 'other', type: 'http', method: 'GET', url: 'https://other.example.org/path' }); }));
  assert.doesNotThrow(() => assertDeployPolicy(s, { AAB_ALLOWED_ACTION_HOSTS: 'API.EXAMPLE.COM, other.example.org' }));
});

const n8nRejected = [
  ['missing base', {}, /N8N_BASE_URL is required/],
  ['malformed base', { N8N_BASE_URL: 'not a valid URL' }, /N8N_BASE_URL is invalid/],
  ['public HTTP', { N8N_BASE_URL: 'http://n8n.example.com' }, /n8n must use HTTPS/],
  ['loopback HTTP disabled', { N8N_BASE_URL: 'http://127.0.0.1:5678' }, /n8n must use HTTPS/],
  ['loopback explicit false', { N8N_BASE_URL: 'http://localhost:5678', AAB_ALLOW_LOCAL_N8N: 'false' }, /n8n must use HTTPS/],
  ['nonlocal HTTP with optin', { N8N_BASE_URL: 'http://n8n.example.com', AAB_ALLOW_LOCAL_N8N: 'true' }, /n8n must use HTTPS/],
  ['nonloopback private HTTP', { N8N_BASE_URL: 'http://192.168.0.1:5678', AAB_ALLOW_LOCAL_N8N: 'true' }, /n8n must use HTTPS/],
  ['ftp with optin', { N8N_BASE_URL: 'ftp://localhost:5678', AAB_ALLOW_LOCAL_N8N: 'true' }, /n8n must use HTTPS/],
  ['credentials in HTTPS URL', { N8N_BASE_URL: 'https://bob:secret@n8n.example.com' }, /n8n must use HTTPS/],
  ['username in HTTPS URL', { N8N_BASE_URL: 'https://bob@n8n.example.com' }, /n8n must use HTTPS/],
  ['query in base URL', { N8N_BASE_URL: 'https://n8n.example.com/?secret=1' }, /n8n must use HTTPS/],
  ['fragment in base URL', { N8N_BASE_URL: 'https://n8n.example.com/#token' }, /n8n must use HTTPS/],
  ['https localhost', { N8N_BASE_URL: 'https://localhost:5678' }, /has a blocked hostname/],
  ['https literal IPv4', { N8N_BASE_URL: 'https://127.0.0.1:5678' }, /has a blocked hostname/],
  ['https internal host', { N8N_BASE_URL: 'https://n8n.internal' }, /has a blocked hostname/],
];
for (const [name, env, message] of n8nRejected) {
  test('n8nBaseUrl: ' + name, () => assert.throws(() => n8nBaseUrl(env), { name: 'ValidationError', message }));
}
for (const [name, env, expected] of [
  ['HTTPS public', { N8N_BASE_URL: 'https://n8n.example.com/base///' }, 'https://n8n.example.com/base'],
  ['loopback IPv4', { N8N_BASE_URL: 'http://127.0.0.1:5678/', AAB_ALLOW_LOCAL_N8N: 'true' }, 'http://127.0.0.1:5678'],
  ['loopback hostname', { N8N_BASE_URL: 'http://localhost:5678/', AAB_ALLOW_LOCAL_N8N: 'true' }, 'http://localhost:5678'],
  ['loopback IPv6', { N8N_BASE_URL: 'http://[::1]:5678/', AAB_ALLOW_LOCAL_N8N: 'true' }, 'http://[::1]:5678'],
]) {
  test('n8nBaseUrl accepts: ' + name, () => assert.equal(n8nBaseUrl(env), expected));
}
test('safeError only reveals intentional validation messages', () => {
  assert.equal(safeError(new ValidationError('safe-for-users')), 'safe-for-users');
  assert.equal(safeError(new Error('secret-token-goes-here')), 'Operation failed. Check provider configuration and server logs.');
  assert.equal(safeError({ name: 'ValidationError', message: 'secret-token-goes-here' }), 'Operation failed. Check provider configuration and server logs.');
});
