import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSpec, publicHttpsUrl, ValidationError } from '../src/spec.mjs';
import { allowedHosts, assertDeployPolicy, n8nBaseUrl, safeError } from '../src/security.mjs';
import { StateStore, fingerprint } from '../src/state.mjs';
import { prepare, inspect, approveLocally, deploy, deploymentStatus } from '../src/operations.mjs';

const basic = () => ({
  version: 1, name: 'A workflow', description: 'Non-secret message',
  trigger: { type: 'manual' },
  actions: [{ id: 'push', type: 'http', method: 'POST', url: 'https://api.example.com/v1/messages',
    headers: { 'content-type': 'application/json' }, body: { message: 'Hi' } }],
});
function rejected(modify, message) {
  const input = basic();
  modify(input);
  assert.throws(() => validateSpec(input), { name: 'ValidationError', message });
}
const envOf = (t, now) => {
  const dir = mkdtempSync(join(tmpdir(), 'aab-boundary-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return {
    AAB_STATE_PATH: join(dir, 'state.sqlite'),
    AAB_ALLOWED_ACTION_HOSTS: 'api.example.com',
    N8N_BASE_URL: 'https://n8n.example.com',
    N8N_API_KEY: 'fixture-key',
  };
};

test('validation errors retain their public name and predictable error messages', () => {
  const e = new ValidationError('Invalid input');
  assert.equal(e.name, 'ValidationError');
  assert.equal(e.message, 'Invalid input');
  assert.equal(safeError(e), 'Invalid input');
  const infrastructure = Error('Bearer hidden-internal-token');
  assert.equal(safeError(infrastructure), 'Operation failed. Check provider configuration and server logs.');
});
for (const value of [null, 3, false, 'text', [], {}]) {
  test('reject malformed automation root: ' + JSON.stringify(value), () => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assert.throws(() => validateSpec(value), { name: 'ValidationError', message: 'version must be 1' });
    } else {
      assert.throws(() => validateSpec(value), { name: 'ValidationError', message: 'Automation must be an object' });
    }
  });
}
test('reject non-v1 spec and unsupported root field', () => {
  rejected(s => { s.version = 2; }, 'version must be 1');
  rejected(s => { s.unsafe = true; }, 'automation: unsupported field unsafe');
});
test('trim workflow name and enforce size and empty-input boundary', () => {
  const input = basic();
  input.name = '   Review   ';
  assert.equal(validateSpec(input).name, 'Review');
  input.name = 'a'.repeat(100);
  assert.equal(validateSpec(input).name.length, 100);
  for (const value of ['', '   ', 42, 'a'.repeat(101)]) {
    rejected(s => { s.name = value; }, 'name must be nonempty text up to 100 characters');
  }
});
test('require a short text description', () => {
  const input = basic();
  input.description = 'd'.repeat(1000);
  assert.equal(validateSpec(input).description.length, 1000);
  for (const value of [null, {}, 5, 'd'.repeat(1001)]) {
    rejected(s => { s.description = value; }, 'description must be text up to 1000 characters');
  }
});
test('trigger types must be explicit and field names constrained', () => {
  rejected(s => { s.trigger = null; }, 'trigger must be an object');
  rejected(s => { s.trigger = []; }, 'trigger must be an object');
  rejected(s => { s.trigger = { type: 'email' }; }, 'Unsupported trigger');
  rejected(s => { s.trigger = { type: 'manual', unknown: true }; }, 'trigger: unsupported field unknown');
  rejected(s => { s.trigger = { type: 'manual', cron: '0 1 * * *' }; }, 'cron is only valid for schedule triggers');
  rejected(s => { s.trigger = { type: 'manual', path: 'events' }; }, 'path is only valid for webhook triggers');
});
test('webhook slug boundaries and normalization', () => {
  for (const path of ['abc', 'a'.repeat(64), 'abc-123']) {
    const s=basic(); s.trigger={type:'webhook',path};
    assert.deepEqual(validateSpec(s).trigger,{type:'webhook',path});
  }
  for (const path of ['ab', 'a'.repeat(65), 'BadName', '/path', 'has space', 5, '..']) {
    rejected(s => {s.trigger = {type:'webhook',path};}, 'webhook path must be a lowercase slug of 3-64 characters');
  }
});
test('schedule requires five fields with restricted syntax', () => {
  for (const cron of ['0 8 * * *', '*/15 * * * 1-5']) {
    const s=basic(); s.trigger={type:'schedule',cron};
    assert.equal(validateSpec(s).trigger.cron,cron);
  }
  for (const cron of ['* * * *', '* * * * * *', '0 12 * * MON', null, '  ']) {
    rejected(s => {s.trigger = {type:'schedule',cron};}, 'schedule requires a five-field cron expression');
  }
});
test('action number boundaries: 1..20', () => {
  const s=basic();
  s.actions=Array.from({length:20},(_,i)=>({id:'a'+i,type:'http',method:'GET',url:'https://api.example.com/'+i}));
  assert.equal(validateSpec(s).actions.length,20);
  s.actions=[];
  assert.throws(()=>validateSpec(s), {name:'ValidationError',message:'actions must contain 1-20 steps'});
  s.actions=Array.from({length:21},(_,i)=>({id:'a'+i,type:'http',method:'GET',url:'https://api.example.com/'+i}));
  assert.throws(()=>validateSpec(s), {name:'ValidationError',message:'actions must contain 1-20 steps'});
});
test('individual action shape and unsupported type', () => {
  rejected(s=>{s.actions=[null];},'Action 0 must be an object');
  rejected(s=>{s.actions=[[]];},'Action 0 must be an object');
  rejected(s=>{s.actions[0].extra=1;},'action 0: unsupported field extra');
  rejected(s=>{s.actions[0].type='shell';},'Only HTTP actions are supported in v0.1');
});
test('action ids enforce uniqueness, lowercase and boundary length', () => {
  for (const id of ['a', 'a'.repeat(40), 'ok_2', 'ok-test']) {
    const s=basic();s.actions[0].id=id;
    assert.equal(validateSpec(s).actions[0].id,id);
  }
  for (const id of ['', 'a'.repeat(41), 'A', '1first', 55, 'has space']) {
    rejected(s=>{s.actions[0].id=id;},'Action IDs must be unique, lowercase, and 1-40 characters');
  }
  rejected(s=>{s.actions.push({...s.actions[0]});},'Action IDs must be unique, lowercase, and 1-40 characters');
});
test('only specified HTTP methods are permitted', () => {
  for (const method of ['GET','POST','PATCH','PUT','DELETE']) {
    const s=basic();s.actions[0].method=method;
    if(method==='GET') delete s.actions[0].body;
    assert.equal(validateSpec(s).actions[0].method,method);
  }
  for (const method of ['get','HEAD','OPTIONS',undefined,1]) {
    rejected(s=>{s.actions[0].method=method;},'Unsupported HTTP method');
  }
  rejected(s=>{s.actions[0].method='GET';},'GET actions cannot have a body');
});
test('headers count, type, names, content and secret controls', () => {
  const s=basic();
  s.actions[0].headers=Object.fromEntries(Array.from({length:12},(_,i)=>['x-header-'+i,'ok']));
  assert.equal(Object.keys(validateSpec(s).actions[0].headers).length,12);
  s.actions[0].headers['x-extra']='ok';
  assert.throws(()=>validateSpec(s),{name:'ValidationError',message:'Too many headers'});
  rejected(s=>{s.actions[0].headers=[];},'headers must be an object');
  rejected(s=>{s.actions[0].headers={Authorization:'secret'};},'Sensitive or invalid header name: Authorization');
  rejected(s=>{s.actions[0].headers={'X-API-KEY':'secret'};},'Sensitive or invalid header name: X-API-KEY');
  rejected(s=>{s.actions[0].headers={'set-cookie':'a=b'};},'Sensitive or invalid header name: set-cookie');
  rejected(s=>{s.actions[0].headers={'Proxy-Authorization':'basic'};},'Sensitive or invalid header name: Proxy-Authorization');
  rejected(s=>{s.actions[0].headers={'bad name':'ok'};},'Sensitive or invalid header name: bad name');
  const t=basic();t.actions[0].headers={A:'v'.repeat(500)};
  assert.equal(validateSpec(t).actions[0].headers.A.length,500);
  for(const value of ['a'.repeat(501),'abc\nx','abc\rx',42]) {
    rejected(s=>{s.actions[0].headers={A:value};},'Invalid header value');
  }
});
test('dangerous expression syntax is rejected even when nested or in keys', () => {
  for(const body of [
    {key:'={{$json.apiKey}}'}, {key:'hello {{secret}}'}, {key:'ends }}'},
    {key:['ordinary',{'{{hidden}}':'oops'}]}, [{data:['hello','{{secrets}}']}], {key:{inner:'=secret'}}
  ]) {
    rejected(s=>{s.actions[0].body=body;},'Provider expressions are not allowed in automation inputs');
  }
  rejected(s=>{s.actions[0].headers={kind:'={{$json.kind}}'};},'Provider expressions are not allowed in automation inputs');
});
test('JSON payload must be <=8KiB and serializable; not required for no-body methods', () => {
  const s=basic();
  s.actions[0].body={text:'a'.repeat(8170)};
  assert.ok(JSON.stringify(validateSpec(s).actions[0].body).length <=8192);
  s.actions[0].body={text:'b'.repeat(8300)};
  assert.throws(()=>validateSpec(s),{name:'ValidationError',message:'Body must be JSON up to 8 KiB'});
  s.actions[0].body=undefined;
  assert.equal('body' in validateSpec(s).actions[0],false);
});
test('overall plan rejects data greater than 64KiB', () => {
  const s=basic();
  s.actions=Array.from({length:20},(_,i)=>({id:'a'+i,type:'http',method:'POST',url:'https://api.example.com/'+i,
    body:{text:'a'.repeat(3200)}}));
  assert.throws(()=>validateSpec(s),{name:'ValidationError',message:'Automation exceeds 64 KiB'});
});
test('public URL validates HTTPS and rejects credentials, fragment, and private hosts', () => {
  assert.equal(publicHttpsUrl('https://api.example.com/path?x=1'),'https://api.example.com/path?x=1');
  for (const [url, message] of [
    ['not a URL','URL must be an absolute URL'],['http://example.com','URL must be HTTPS without credentials or fragments'],
    ['https://user@example.com/path','URL must be HTTPS without credentials or fragments'],
    ['https://example.com/#fragment','URL must be HTTPS without credentials or fragments'],
    ['https://127.0.0.1/','URL has a blocked hostname'],['https://localhost/','URL has a blocked hostname'],
    ['https://my.localhost/','URL has a blocked hostname'],['https://server.local/','URL has a blocked hostname'],
    ['https://db.internal/','URL has a blocked hostname'],['https://foo.test/','URL has a blocked hostname'],
    ['https://foo.invalid/','URL has a blocked hostname'],['https://hidden.onion/','URL has a blocked hostname'],
    ['https://metadata.google.internal/','URL has a blocked hostname'],['https://example/','URL has a blocked hostname']
  ]) assert.throws(()=>publicHttpsUrl(url),{name:'ValidationError',message},url);
});
test('action host allowlist is normalized but never suffix-matches', () => {
  assert.deepEqual([...allowedHosts({AAB_ALLOWED_ACTION_HOSTS:'  API.EXAMPLE.COM, , httpbin.org,api.example.com'})],
    ['api.example.com','httpbin.org']);
  assert.equal(allowedHosts({}).size,0);
  const s=validateSpec(basic());
  assert.doesNotThrow(()=>assertDeployPolicy(s,{AAB_ALLOWED_ACTION_HOSTS:' api.example.com '}));
  assert.throws(()=>assertDeployPolicy(s,{}),{name:'ValidationError',message:'Set AAB_ALLOWED_ACTION_HOSTS before deployment'});
  for(const hostname of ['example.com','sub.api.example.com','another.example.com']) {
    assert.throws(()=>assertDeployPolicy(s,{AAB_ALLOWED_ACTION_HOSTS:hostname}),
      {name:'ValidationError',message:'Action host is not allowlisted: api.example.com'});
  }
});
test('provider n8n endpoint rejects non-TLS, malformed and credentials', () => {
  for (const [env, message] of [
    [{},'N8N_BASE_URL is required'],[{N8N_BASE_URL:'not a url'},'N8N_BASE_URL is invalid'],
    [{N8N_BASE_URL:'http://n8n.example.com'},'n8n must use HTTPS, or explicitly enabled HTTP loopback'],
    [{N8N_BASE_URL:'https://user:secret@n8n.example.com'},'n8n must use HTTPS, or explicitly enabled HTTP loopback'],
    [{N8N_BASE_URL:'https://n8n.example.com?key=x'},'n8n must use HTTPS, or explicitly enabled HTTP loopback'],
    [{N8N_BASE_URL:'https://n8n.example.com/#fragment'},'n8n must use HTTPS, or explicitly enabled HTTP loopback'],
    [{N8N_BASE_URL:'http://localhost:5678'},'n8n must use HTTPS, or explicitly enabled HTTP loopback'],
  ]) assert.throws(()=>n8nBaseUrl(env),{name:'ValidationError',message});
  assert.equal(n8nBaseUrl({N8N_BASE_URL:'https://n8n.example.com/'}),'https://n8n.example.com');
  assert.equal(n8nBaseUrl({N8N_BASE_URL:'http://localhost:5678/',AAB_ALLOW_LOCAL_N8N:'true'}),'http://localhost:5678');
});
test('state preview records correct expiration and fingerprint and closes database', t=>{
  let now=12345;const env=envOf(t);const store=new StateStore(env,()=>now);
  const spec=validateSpec(basic());
  const row=store.createPreview('n8n',spec);
  assert.equal(row.fingerprint,fingerprint(spec));
  assert.equal(new Date(row.expiresAt).getTime(), now+1800000);
  assert.equal(store.preview(row.previewId).digest, row.fingerprint);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM audit WHERE event=?').get('preview_created').n,1);
  assert.deepEqual(store.approve(row.previewId),{previewId:row.previewId,fingerprint:row.fingerprint,approved:true});
  assert.equal(store.preview(row.previewId).approved_at,now);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM audit WHERE event=?').get('preview_approved').n,1);
  store.close();
  assert.throws(()=>store.db.prepare('SELECT 1'));
});
test('state denies approval at exact expiration boundary',t=>{
  let now=0;const env=envOf(t);const store=new StateStore(env,()=>now);
  const p=store.createPreview('n8n',validateSpec(basic()));
  now=1800000;
  assert.throws(()=>store.approve(p.previewId),{name:'ValidationError',message:'Preview expired; create another preview'});
  store.close();
});
test('state fails on preview ID invalid or unknown and catches tampering',t=>{
  const env=envOf(t);const store=new StateStore(env);
  for(const invalid of [null,3,'','b'.repeat(35),'z'.repeat(36)]) {
    assert.throws(()=>store.preview(invalid),{name:'ValidationError',message:'Invalid preview ID'});
  }
  assert.throws(()=>store.preview('a'.repeat(36)),{name:'ValidationError',message:'Preview not found'});
  const p=store.createPreview('n8n',validateSpec(basic()));
  store.db.prepare('UPDATE previews SET spec_json=? WHERE id=?').run(JSON.stringify({version:999}),p.previewId);
  assert.throws(()=>store.preview(p.previewId),{name:'ValidationError',message:'Preview integrity check failed'});
  store.close();
});
test('claim enforces one approved preview, idempotency key shape, and atomic uniqueness',t=>{
  let now=2;const env=envOf(t);const store=new StateStore(env,()=>now);
  const p=store.createPreview('n8n',validateSpec(basic()));
  for(const value of [null,3,'short','x'.repeat(129),'/'.repeat(20)]) {
    assert.throws(()=>store.claim(p.previewId,value),{name:'ValidationError',message:'idempotencyKey must be 12-128 safe characters'});
  }
  assert.throws(()=>store.claim(p.previewId,'first-idempotency-key'),{name:'ValidationError',
    message:'Preview requires local human approval: ai-automation-builder approve '+p.previewId});
  store.approve(p.previewId);
  const first=store.claim(p.previewId,'first-idempotency-key');
  assert.equal(first.claimed,true);
  assert.equal(store.claim(p.previewId,'first-idempotency-key').claimed,false);
  assert.throws(()=>store.claim(p.previewId,'another-idempotency-key'),{name:'ValidationError',
    message:'Preview already claimed with another idempotency key'});
  const second=store.createPreview('n8n',validateSpec(basic()));
  store.approve(second.previewId);
  assert.throws(()=>store.claim(second.previewId,'first-idempotency-key'),{name:'ValidationError',
    message:'Idempotency key already belongs to another preview'});
  store.finish('first-idempotency-key','created_inactive','wf-001');
  const result=store.status('first-idempotency-key');
  assert.equal(result.status,'created_inactive');
  assert.equal(result.workflowId,'wf-001');
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM audit WHERE event=?').get('deployment_claimed').n,1);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM audit WHERE event=?').get('deployment_created_inactive').n,1);
  assert.throws(()=>store.finish('first-idempotency-key','created_inactive','wf-002'),{name:'ValidationError',message:'Deployment state transition rejected'});
  assert.throws(()=>store.finish('first-idempotency-key','unexpected'),{name:'ValidationError',message:'Invalid deployment state'});
  store.close();
});
test('stale in-progress deployment is recorded uncertain after 90 seconds',t=>{
  let now=500;const env=envOf(t);const store=new StateStore(env,()=>now);
  const p=store.createPreview('n8n',validateSpec(basic()));store.approve(p.previewId);
  const key='stale-idempotency-key';store.claim(p.previewId,key);
  now=500+90000;
  assert.equal(store.status(key).status,'in_progress');
  now=500+90001;
  assert.equal(store.status(key).status,'uncertain');
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM audit WHERE event=?').get('deployment_stale_uncertain').n,1);
  store.close();
});
test('invalid deployment status keys and unknown values fail closed',t=>{
  const env=envOf(t);const store=new StateStore(env);
  for(const value of [null,3,'no','*'.repeat(12)]) {
    assert.throws(()=>store.status(value),{name:'ValidationError',message:'Invalid idempotency key'});
  }
  assert.throws(()=>store.status('unknown-lookup-key'),{name:'ValidationError',message:'Deployment not found'});
  store.close();
});
test('operations preview receipt includes warnings, inactive n8n graph and approval state',t=>{
  const env=envOf(t);
  const p=prepare(basic(),'n8n',env);
  assert.equal(p.provider,'n8n');
  assert.equal(p.workflow.nodes.length,2);
  assert.equal(p.warnings.length,3);
  assert.match(p.warnings[0],/No workflow created/);
  assert.match(p.warnings[1],/30 minutes/);
  assert.match(p.warnings[2],/network-level/);
  assert.equal(inspect(p.previewId,env).approved,false);
  assert.deepEqual(approveLocally(p.previewId,env),{previewId:p.previewId,fingerprint:p.fingerprint,approved:true});
  assert.equal(inspect(p.previewId,env).approved,true);
});
test('operations reject unsupported providers, missing configured keys and distinct failures',async t=>{
  const env=envOf(t);
  assert.throws(()=>prepare(basic(),'zapier',env),{name:'ValidationError',message:'Only n8n is supported for deployment in v0.2.0'});
  const p=prepare(basic(),'n8n',env);approveLocally(p.previewId,env);
  await assert.rejects(deploy(p.previewId,p.idempotencyKey,{...env,N8N_API_KEY:''}),{
    name:'ValidationError',message:'N8N_API_KEY is required'
  });
  assert.throws(()=>deploymentStatus(p.idempotencyKey,env),{name:'ValidationError',message:'Deployment not found'});
});
test('ambiguous API creation results include the warning and do not replay',async t=>{
  const env=envOf(t);const p=prepare(basic(),'n8n',env);approveLocally(p.previewId,env);
  let count=0;
  const fetcher=async()=>{count++;throw new Error('timeout');};
  const x=await deploy(p.previewId,p.idempotencyKey,env,fetcher);
  assert.equal(x.status,'uncertain');
  assert.match(x.warning,/Inspect n8n/);
  assert.equal((await deploy(p.previewId,p.idempotencyKey,env,fetcher)).status,'uncertain');
  assert.equal(count,1);
});
