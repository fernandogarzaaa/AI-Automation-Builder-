import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { compileN8n } from '../src/n8n.mjs';

const step = id => ({ id, type: 'http', method: 'GET', url: 'https://api.example.com/' + id });
const input = () => ({
  version: 2, name: 'Graph', description: 'Explicit graph',
  trigger: { type: 'manual' },
  actions: [{ ...step('alpha'), next: 'beta' }, step('beta')],
});
const graphEdges = input => {
  const connections = compileN8n(validateSpec(input)).connections;
  return Object.fromEntries(Object.entries(connections).map(([key, value]) => [key, value.main[0][0].node]));
};

test('v2 explicit linear graph emits the correct edges', () => {
  assert.deepEqual(graphEdges(input()), { Start: 'alpha', alpha: 'beta' });
});
test('v2 implicit order stays compatible with v1', () => {
  const data = input(); delete data.actions[0].next;
  assert.deepEqual(graphEdges(data), { Start: 'alpha', alpha: 'beta' });
});
test('v2 supports a fully specified reordered path independent of array order', () => {
  const data = input();
  data.actions = [
    { ...step('bravo'), next: 'charlie' },
    { ...step('delta'), next: 'bravo' },
    { ...step('alpha'), next: 'delta' },
    step('charlie'),
  ];
  assert.deepEqual(graphEdges(data), { Start: 'alpha', bravo: 'charlie', delta: 'bravo', alpha: 'delta' });
  assert.equal(validateSpec(data).actions.length, 4);
});
test('v2 accepts an explicit null terminal without creating an outgoing edge', () => {
  const data = input(); data.actions[1].next = null;
  assert.deepEqual(graphEdges(data), { Start: 'alpha', alpha: 'beta' });
  assert.ok(!Object.hasOwn(validateSpec(data).actions[1], 'next'));
});
test('v2 rejects unknown, malformed, and self edges', () => {
  const data = input();
  for (const next of ['missing', 'Invalid', 17, {}, 'alpha']) {
    data.actions[0].next = next;
    assert.throws(() => validateSpec(data), ValidationError, String(next));
  }
});
test('v2 rejects cycles', () => {
  const data = input(); data.actions[1].next = 'alpha';
  assert.throws(() => validateSpec(data), ValidationError);
});
test('v2 rejects disconnected components', () => {
  const data = input(); data.actions.push(step('orphan'));
  assert.throws(() => validateSpec(data), /exactly one entry|acyclic and connected/);
});
test('v2 rejects edges that merge into a node', () => {
  const data = input();
  data.actions = [{...step('alpha'),next:'charlie'},{...step('bravo'),next:'charlie'},step('charlie')];
  assert.throws(() => validateSpec(data), /Multiple incoming edges/);
});
test('v2 rejects cycles hidden behind disconnected entry points', () => {
  const data = input();
  data.actions = [{...step('alpha'),next:'beta'},{...step('beta'),next:'alpha'},step('orphan')];
  assert.throws(() => validateSpec(data), /acyclic and connected/);
});
test('v1 rejects every explicit v2-only edge including null', () => {
  const data = input(); data.version = 1;
  assert.throws(() => validateSpec(data), ValidationError);
  data.actions[0].next=null;
  assert.throws(() => validateSpec(data), ValidationError);
});
