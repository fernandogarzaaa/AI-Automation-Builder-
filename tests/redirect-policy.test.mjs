import test from 'node:test';
import assert from 'node:assert/strict';
import { requestN8n } from '../src/n8n.mjs';
import { planAutomation } from '../src/planner.mjs';

test('n8n API key requests reject HTTP redirects at the transport layer', async () => {
  let options;
  const response = await requestN8n('/workflows', 'GET', undefined,
    { N8N_BASE_URL: 'https://staging.example.com', N8N_API_KEY: 'secret-fixture' },
    async (_url, init) => { options = init; return {ok:true,text:async()=>'{"data":[]}'}; });
  assert.deepEqual(response,{data:[]});
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['X-N8N-API-KEY'], 'secret-fixture');
});
test('natural-language model call rejects HTTP redirects with bearer credentials', async () => {
  let options;
  const result = await planAutomation('Please send a GET request to https://api.example.org/notify', {
    AI_BASE_URL: 'https://models.example.com/v1', AI_API_KEY: 'secret-fixture', AI_MODEL: 'unit-test-model',
  }, async (_url, init) => {
    options = init;
    return { ok:true, json:async()=>({ choices:[{message:{content:JSON.stringify({
      version:1,name:'Test plan',description:'Test',trigger:{type:'manual'},
      actions:[{id:'notify',type:'http',method:'GET',url:'https://api.example.org/notify'}],
    })}}]}) };
  });
  assert.equal(result.version,1);
  assert.equal(options.redirect,'error');
  assert.equal(options.headers.authorization,'Bearer secret-fixture');
});
test('HTTP 302 responses are rejected without following Location', async () => {
  let calls = 0;
  await assert.rejects(requestN8n('/workflows','GET',undefined, {
    N8N_BASE_URL: 'https://staging.example.com', N8N_API_KEY: 'key',
  },async()=>{calls++;return {ok:false,status:302,text:async()=>''};}), /HTTP 302/);
  assert.equal(calls,1);
});
