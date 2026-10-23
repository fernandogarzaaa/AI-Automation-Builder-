import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyN8nStaging } from '../scripts/qualify-n8n-staging.mjs';
import { compileN8n } from '../src/n8n.mjs';
const settings = () => ({
  AAB_STAGING_CONFIRM: 'STAGING_ONLY_CREATE_AND_DELETE',
  AAB_STAGING_EXPECTED_HOST: 'staging.example.com', N8N_BASE_URL: 'https://staging.example.com',
  N8N_API_KEY: 'fixture', AAB_ALLOWED_ACTION_HOSTS: 'api.example.com',
  AAB_STAGING_ACTION_URL: 'https://api.example.com/ping',
});
const fake = (opts={}) => {
  let name; const methods=[];
  const fetcher = async (url, init) => {
    methods.push(init.method);
    if (init.method === 'POST') {
      const data = JSON.parse(init.body); name = data.name;
      return { ok:true, text:async()=>JSON.stringify({id:'xyz123',name}) };
    }
    if (init.method === 'GET') {
      const spec={version:1,name,trigger:{type:'manual'},actions:[{id:'probe',type:'http',method:'GET',url:'https://api.example.com/ping',headers:{}}]};
      const data={...compileN8n(spec),id:'xyz123',name:opts.wrongName?'unrelated':name,active:!!opts.active};
      if (opts.tamper) data.nodes[1].parameters.url='https://evil.example.org';
      return { ok:true, text:async()=>JSON.stringify(data) };
    }
    return opts.deleteFails ? {ok:false,status:503,text:async()=>'{}'} : {ok:true,text:async()=>'{}'};
  };
  return {fetcher,methods};
};
test('staging guard rejects unsafe/missing settings without network calls', async()=>{
  for (const bad of [{AAB_STAGING_CONFIRM:''},{AAB_STAGING_EXPECTED_HOST:'prod.example.org'},{AAB_ALLOWED_ACTION_HOSTS:'bad.example.org'},{AAB_STAGING_ACTION_URL:'http://bad.example.org'},{N8N_API_KEY:''}]) {
    let calls=0;
    await assert.rejects(qualifyN8nStaging({...settings(),...bad},async()=>{calls++;throw Error('unexpected fetch')}));
    assert.equal(calls,0);
  }
});
test('inactive create, two GET readbacks, DELETE without execution', async()=>{
  const p=fake();const result=await qualifyN8nStaging(settings(),p.fetcher);
  assert.equal(result.status,'create_readback_delete_qualified');
  assert.equal(result.executed,false);
  assert.deepEqual(p.methods,['POST','GET','GET','DELETE']);
});
test('wrong name never authorizes deletion',async()=>{
  const p=fake({wrongName:true});
  await assert.rejects(qualifyN8nStaging(settings(),p.fetcher),/cleanup unconfirmed/);
  assert.deepEqual(p.methods,['POST','GET']);
});
test('active workflow never authorizes deletion',async()=>{
  const p=fake({active:true});
  await assert.rejects(qualifyN8nStaging(settings(),p.fetcher),/cleanup unconfirmed/);
  assert.deepEqual(p.methods,['POST','GET']);
});
test('wrong graph is blocked and owned inactive workflow deleted',async()=>{
  const p=fake({tamper:true});
  await assert.rejects(qualifyN8nStaging(settings(),p.fetcher),/cleaned/);
  assert.deepEqual(p.methods,['POST','GET','GET','DELETE']);
});
test('cleanup failure blocks qualification',async()=>{
  const p=fake({deleteFails:true});
  await assert.rejects(qualifyN8nStaging(settings(),p.fetcher),/cleanup unconfirmed/);
  assert.equal(p.methods.at(-1),'DELETE');
});
