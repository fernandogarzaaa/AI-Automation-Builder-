#!/usr/bin/env node
import { planAutomation } from './planner.mjs';
import { providers } from './core.mjs';
import { prepare, inspect, deploy, deploymentStatus } from './operations.mjs';
import { safeError } from './security.mjs';

const specSchema = { type: 'object', description: 'Portable AutomationSpec v1 object; use automation_plan to generate one.' };
const tools = [
  {
    name: 'automation_providers',
    description: 'List supported automation platforms and actual deployment capabilities.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'automation_plan',
    description: 'Convert a natural-language request into a validated, provider-neutral automation spec. Requires configured AI model; never deploys.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string', minLength: 10, maxLength: 4000 } }, required: ['prompt'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'automation_preview',
    description: 'Validate spec and create a 30-minute local preview receipt; review it before local human approval.',
    inputSchema: { type: 'object', properties: { spec: specSchema }, required: ['spec'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'automation_inspect',
    description: 'Inspect a preview and its approval state.',
    inputSchema: { type: 'object', properties: { previewId: { type: 'string' } }, required: ['previewId'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'automation_deploy',
    description: 'Create an inactive n8n workflow after a human runs ai-automation-builder approve PREVIEW_ID in a terminal. Requires an idempotency key.',
    inputSchema: {
      type: 'object',
      properties: { previewId: { type: 'string' }, idempotencyKey: { type: 'string', minLength: 12, maxLength: 128 } },
      required: ['previewId', 'idempotencyKey'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, readOnlyHint: false },
  },
  {
    name: 'automation_status', description: 'Inspect a deployment outcome by idempotency key.',
    inputSchema: { type: 'object', properties: { idempotencyKey: { type: 'string' } }, required: ['idempotencyKey'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

const send = (payload) => process.stdout.write(JSON.stringify(payload) + '\n');
const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

async function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
  switch (name) {
    case 'automation_providers': return providers();
    case 'automation_plan': return await planAutomation(args.prompt);
    case 'automation_preview': return prepare(args.spec);
    case 'automation_inspect': return inspect(args.previewId);
    case 'automation_deploy': return await deploy(args.previewId, args.idempotencyKey);
    case 'automation_status': return deploymentStatus(args.idempotencyKey);
    default: throw new Error('Unknown tool');
  }
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (message.id === undefined || message.id === null) return; // notifications
  const id = message.id;
  try {
    let output;
    switch (message.method) {
      case 'initialize':
        output = {
          protocolVersion: ['2025-11-25', '2025-06-18'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2025-11-25',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'ai-automation-builder', version: '0.2.0' },
          instructions: 'Plan, preview, then ask human to run ai-automation-builder approve PREVIEW_ID locally; deployment creates an inactive n8n workflow only.',
        };
        break;
      case 'ping': output = {}; break;
      case 'tools/list': output = { tools }; break;
      case 'tools/call':
        try {
          output = result(await callTool(message.params?.name, message.params?.arguments ?? {}));
        } catch (error) {
          output = { content: [{ type: 'text', text: safeError(error) }], isError: true };
        }
        break;
      default:
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
        return;
    }
    send({ jsonrpc: '2.0', id, result: output });
  } catch {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } });
  }
}

let buffer = '';
let inflight = 0;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  if (buffer.length > 1048576) {
    console.error('MCP input exceeded 1 MiB');
    process.exitCode = 1;
    process.stdin.pause();
    return;
  }
  let index;
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    if (inflight >= 4) {
      if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Server busy' } });
      continue;
    }
    inflight++;
    void handle(message).finally(() => { inflight--; });
  }
});
