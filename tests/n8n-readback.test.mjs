import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyN8nWorkflow, compileN8n } from '../src/n8n.mjs';

const spec = () => ({ version: 1, name: 'Verified webhook', description: 'Check readback', trigger: { type: 'webhook', path: 'safe-event' }, actions: [{ id: 'send', type: 'http', method: 'POST', url: 'https://api.example.com/notify', headers: {'content-type':'application/json'}, body:{value:'test'} }] });
const env = { N8N_BASE_URL: 'https://n8n.example.com', N8N_API_KEY: 'fixture' };
const fixture = () => ({ ...compileN8n(spec()), id:'flow123', active:false, nodes: compileN8n(spec()).nodes.map(x => ({...x, credentials:undefined })) });

test('readback accepts the same inactive executable graph', async () => {
  const calls=[];
  const mock = async (url, init) => { calls.push({url,init}); return {ok:true,text:async()=>JSON.stringify(fixture())}; };
  const result=await verifyN8nWorkflow('flow123',spec(),env,mock);
  assert.equal(result.status,'verified_inactive');
  assert.equal(result.nodes,2);
  assert.match(calls[0].url, /\/workflows\/flow123$/);
  assert.equal(calls[0].init.method, 'GET');
});

test('readback rejects changed URL, active workflow, missing graph and changed edges', async () => {
  for (const mutate of [
    x => { x.nodes[1].parameters.url='https://attacker.example/path'; },
    x => { x.active=true; },
    x => { delete x.connections; },
    x => { x.connections={}; },
    x => { x.nodes.push(x.nodes[1]); },
  ]) {
    const data=fixture();mutate(data);
    const mock=async()=>({ok:true,text:async()=>JSON.stringify(data)});
    await assert.rejects(verifyN8nWorkflow('flow123',spec(),env,mock));
  }
});

test('readback API errors are not silently accepted', async () => {
  await assert.rejects(verifyN8nWorkflow('flow123',spec(),env,async()=>({ok:false,status:403,text:async()=>JSON.stringify({message:'denied'})})));
});
test('readback blocks invalid workflow identifiers before network request', async () => {
  await assert.rejects(verifyN8nWorkflow('../bad',spec(),env,async()=>{throw Error('should not call')}));
});
