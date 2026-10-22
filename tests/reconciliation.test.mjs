import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepare, approveLocally, deploy, deploymentStatus, reconcileLocally } from '../src/operations.mjs';
import { compileN8n } from '../src/n8n.mjs';

const sample={version:1,name:'Reconcile',description:'Example',trigger:{type:'manual'},actions:[{id:'send',type:'http',method:'POST',url:'https://api.example.com/notify'}]};
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'aab-reconcile-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return {AAB_STATE_PATH:join(dir,'state.sqlite'),AAB_ALLOWED_ACTION_HOSTS:'api.example.com',N8N_BASE_URL:'https://n8n.example.com',N8N_API_KEY:'fixture'};
}
test('known created ID survives failed readback and can be reconciled without second POST', async t=>{
 const env=setup(t),p=prepare(sample,'n8n',env);
 approveLocally(p.previewId,env);
 let posts=0,reads=0;
 const broken=async (_url,init)=>{
   if(init.method==='POST'){posts++;return {ok:true,text:async()=>JSON.stringify({id:'flow123'})};}
   reads++;throw Error('socket reset');
 };
 const first=await deploy(p.previewId,p.idempotencyKey,env,broken);
 assert.equal(first.status,'uncertain');
 assert.equal(deploymentStatus(p.idempotencyKey,env).workflowId,'flow123');
 assert.equal(posts,1);
 await assert.rejects(reconcileLocally(p.idempotencyKey,'other123',env,()=>{throw Error('never call')}));
 const good=async (_url,init)=>{
   assert.equal(init.method,'GET');reads++;
   return {ok:true,text:async()=>JSON.stringify({...compileN8n(p.spec),id:'flow123',active:false})};
 };
 const result=await reconcileLocally(p.idempotencyKey,'flow123',env,good);
 assert.equal(result.status,'created_inactive');
 assert.equal(result.workflowId,'flow123');
 assert.equal(posts,1);assert.equal(reads,2);
 await assert.rejects(reconcileLocally(p.idempotencyKey,'flow123',env,good));
});
test('reconcile fails closed on graph change, active workflow or unreachable n8n',async t=>{
 const env=setup(t),p=prepare(sample,'n8n',env);approveLocally(p.previewId,env);
 let posts=0;
 const broken=async (_url,init)=>{if(init.method==='POST'){posts++;return {ok:true,text:async()=>JSON.stringify({id:'flow987'})}}throw Error('lost connection')};
 await deploy(p.previewId,p.idempotencyKey,env,broken);
 for(const mutate of [d=>{d.active=true},d=>{d.nodes[1].parameters.url='https://bad.example.com/'},d=>{d.connections={}}]){
   const data={...compileN8n(p.spec),id:'flow987',active:false};mutate(data);
   await assert.rejects(reconcileLocally(p.idempotencyKey,'flow987',env,async()=>({ok:true,text:async()=>JSON.stringify(data)})));
   assert.equal(deploymentStatus(p.idempotencyKey,env).status,'uncertain');
 }
 await assert.rejects(reconcileLocally(p.idempotencyKey,'flow987',env,async()=>{throw Error('offline')}));
 assert.equal(posts,1);
});
