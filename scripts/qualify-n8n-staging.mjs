import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateSpec, ValidationError } from '../src/spec.mjs';
import { assertDeployPolicy, n8nBaseUrl, safeError } from '../src/security.mjs';
import { createN8nWorkflow, requestN8n, verifyN8nWorkflow } from '../src/n8n.mjs';

export async function qualifyN8nStaging(env = process.env, fetcher = fetch) {
  if (env.AAB_STAGING_CONFIRM !== 'STAGING_ONLY_CREATE_AND_DELETE') throw new ValidationError('Explicit staging opt-in required');
  const base = new URL(n8nBaseUrl(env));
  const host = env.AAB_STAGING_EXPECTED_HOST;
  if (!host || !/^[a-z0-9.-]+$/i.test(host) || base.hostname !== host.toLowerCase()) throw new ValidationError('Staging n8n hostname mismatch');
  if (!env.N8N_API_KEY) throw new ValidationError('N8N_API_KEY is required');
  const name = 'aab-staging-probe-' + randomUUID().replaceAll('-', '').slice(0, 16);
  const spec = validateSpec({
    version: 1, name, description: 'Inactive create/readback/delete probe',
    trigger: { type: 'manual' },
    actions: [{ id: 'probe', type: 'http', method: 'GET', url: env.AAB_STAGING_ACTION_URL }],
  });
  assertDeployPolicy(spec, env);
  let id = null, ownershipVerified = false, graphVerified = false, cleaned = false, failure = null;
  try {
    id = (await createN8nWorkflow(spec, env, fetcher)).id;
    const live = await requestN8n('/workflows/' + encodeURIComponent(id), 'GET', undefined, env, fetcher);
    ownershipVerified = live.name === name && live.active === false;
    if (!ownershipVerified) throw new Error('Workflow name or inactive state mismatch');
    await verifyN8nWorkflow(id, spec, env, fetcher);
    graphVerified = true;
  } catch (error) { failure = error; }
  finally {
    // Never delete an unrelated workflow identified only by a provider ID.
    if (id && ownershipVerified) {
      try {
        await requestN8n('/workflows/' + encodeURIComponent(id), 'DELETE', undefined, env, fetcher);
        cleaned = true;
      } catch (error) { failure = failure ?? error; }
    }
  }
  if (failure || !graphVerified || !cleaned) {
    throw new Error('Staging qualification blocked; inspect workflow ' + name + (id ? ' ID ' + id : '') + (cleaned ? ' (cleaned)' : ' (cleanup unconfirmed)'));
  }
  return { provider: 'n8n', status: 'create_readback_delete_qualified', inactive: true, executed: false, cleaned: true };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await qualifyN8nStaging())); }
  catch (error) { console.error(JSON.stringify({ status: 'BLOCKED', error: safeError(error) })); process.exitCode = 1; }
}
