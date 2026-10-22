#!/usr/bin/env node
import { planAutomation } from './planner.mjs';
import { previewAutomation, deployAutomation, providers } from './core.mjs';
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
    description: 'Validate a spec and compile an n8n workflow preview without side effects. Review before deployment.',
    inputSchema: { type: 'object', properties: { spec: specSchema }, required: ['spec'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'automation_deploy',
    description: 'Create an n8n workflow. Side effect. Only call after the user explicitly reviews and approves the preview; activate requires separate explicit consent.',
    inputSchema: {
      type: 'object',
      properties: { spec: specSchema, approved: { type: 'boolean', const: true }, activate: { type: 'boolean', default: false } },
      required: ['spec', 'approved'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, readOnlyHint: false },
  },
];

const send = (payload) => process.stdout.write(JSON.stringify(payload) + '\n');
const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

async function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
  switch (name) {
    case 'automation_providers': return providers();
    case 'automation_plan': return await planAutomation(args.prompt);
    case 'automation_preview': return previewAutomation(args.spec);
    case 'automation_deploy': return await deployAutomation(args.spec, { approved: args.approved, activate: args.activate });
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
          protocolVersion: ['2026-07-28', '2025-11-25', '2025-06-18'].includes(message.params?.protocolVersion) ? message.params.protocolVersion : '2025-11-25',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'ai-automation-builder', version: '0.1.0' },
          instructions: 'Plan, preview, and obtain explicit human approval before deployment. Deployment never activates by default.',
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
