import { randomUUID } from 'node:crypto';
import { StateStore } from './state.mjs';
import { validateSpec, ValidationError } from './spec.mjs';
import { assertDeployPolicy, n8nBaseUrl } from './security.mjs';
import { compileN8n, createN8nWorkflow, verifyN8nWorkflow } from './n8n.mjs';

function providerFor(value) {
  if (value !== 'n8n') throw new ValidationError('Only n8n is supported for deployment in v0.2.0');
  return value;
}

export function prepare(input, provider = 'n8n', env = process.env) {
  providerFor(provider);
  const spec = validateSpec(input);
  assertDeployPolicy(spec, env);
  const store = new StateStore(env);
  try {
    return {
      ...store.createPreview(provider, spec), idempotencyKey: randomUUID(), provider, spec,
      workflow: compileN8n(spec),
      warnings: ['No workflow created. Review the exact requests and then approve locally.',
        'Approval expires after 30 minutes; creation is inactive.',
        'The execution worker still requires network-level outbound restrictions.'],
    };
  } finally { store.close(); }
}

export function inspect(previewId, env = process.env) {
  const store = new StateStore(env);
  try {
    const row = store.preview(previewId);
    return {
      previewId: row.id, provider: row.provider, fingerprint: row.digest,
      expiresAt: new Date(row.expires_at).toISOString(), approved: row.approved_at !== null,
      spec: row.spec, workflow: compileN8n(row.spec),
    };
  } finally { store.close(); }
}

// Deliberately NOT exported as an MCP or REST endpoint. Approvals must occur in an
// operator-owned local session, not through a model-callable boolean argument.
export function approveLocally(previewId, env = process.env) {
  const store = new StateStore(env);
  try { return store.approve(previewId); } finally { store.close(); }
}

export async function deploy(previewId, idempotencyKey, env = process.env, fetcher = fetch) {
  const store = new StateStore(env);
  let claim;
  try {
    const existingPreview = store.preview(previewId);
    assertDeployPolicy(existingPreview.spec, env);
    n8nBaseUrl(env);
    if (!env.N8N_API_KEY) throw new ValidationError('N8N_API_KEY is required');
    claim = store.claim(previewId, idempotencyKey);
    if (!claim.claimed) return store.status(idempotencyKey);
    const created = await createN8nWorkflow(claim.preview.spec, env, fetcher);
    // Creation and verification are separate network operations. A readback
    // failure is uncertain, never permission to create a second workflow.
    await verifyN8nWorkflow(created.id, claim.preview.spec, env, fetcher);
    store.finish(idempotencyKey, 'created_inactive', created.id);
    return store.status(idempotencyKey);
  } catch (error) {
    if (claim?.claimed) {
      // Even a timeout may mean a workflow was created. Never automatically repeat POST.
      store.finish(idempotencyKey, 'uncertain');
      return { idempotencyKey, status: 'uncertain', warning: 'Creation could not be verified. Inspect n8n before reconciliation. Do not retry with a new key.' };
    }
    throw error;
  } finally { store.close(); }
}

export function deploymentStatus(idempotencyKey, env = process.env) {
  const store = new StateStore(env);
  try { return store.status(idempotencyKey); } finally { store.close(); }
}
