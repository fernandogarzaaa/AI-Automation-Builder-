import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { compileN8n } from '../src/n8n.mjs';
const input=()=>({version:2,name:'Graph',description:'Explicit graph',trigger:{type:'manual'},actions:[{id:'alpha',type:'http',method:'GET',url:'https://api.example.com/a',next:'beta'},{id:'beta',type:'http',method:'GET',url:'https://api.example.com/b'}]});
test('version 2 explicit linear graph compiles deterministic edges',()=>{const s=validateSpec(input());assert.equal(s.version,2);const n=compileN8n(s);assert.equal(n.connections.Start.main[0][0].node,'alpha');assert.equal(n.connections.alpha.main[0][0].node,'beta');assert.equal(n.connections.beta,undefined)});
test('graph rejects dangling edges',()=>{const x=input();x.actions[0].next='missing';assert.throws(()=>validateSpec(x),ValidationError)});
test('graph rejects cycles and disconnected steps',()=>{const x=input();x.actions[1].next='alpha';assert.throws(()=>validateSpec(x),ValidationError)});
test('v1 rejects v2-only fields',()=>{const x=input();x.version=1;assert.throws(()=>validateSpec(x),ValidationError)});
