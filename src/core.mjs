import { validateSpec, ValidationError } from './spec.mjs';
import { assertDeployPolicy } from './security.mjs';
import { compileN8n, createN8nWorkflow, activateN8nWorkflow } from './n8n.mjs';

export function providers() {
  return [
    { id: 'n8n', capability: 'compile_and_create', activation: 'explicit_opt_in', status: 'implemented' },
    { id: 'portable-json', capability: 'validated_intermediate_representation', status: 'implemented' },
    { id: 'activepieces', capability: 'none', status: 'planned' },
    { id: 'make', capability: 'none', status: 'planned' },
    { id: 'zapier', capability: 'none', status: 'planned' },
  ];
}

export function previewAutomation(input) {
  const spec = validateSpec(input);
  return {
    spec,
    provider: 'n8n',
    deployable: true,
    draft: compileN8n(spec),
    warnings: [
      'Preview only: no network request or workflow creation has occurred.',
      'Only static HTTPS HTTP actions are supported. Provider credentials and dynamic mappings are not generated.',
      'Review all URLs, methods and payloads before approving deployment.',
    ],
  };
}

export async function deployAutomation(input, options = {}, env = process.env, fetcher = fetch) {
  if (options.approved !== true) throw new ValidationError('Deployment requires approved: true after preview and human review');
  const spec = validateSpec(input);
  assertDeployPolicy(spec, env);
  const created = await createN8nWorkflow(spec, env, fetcher);
  if (options.activate !== true) return { provider: 'n8n', ...created };
  try {
    const activated = await activateN8nWorkflow(created.id, env, fetcher);
    return { provider: 'n8n', ...activated, name: created.name };
  } catch {
    return {
      provider: 'n8n',
      id: created.id,
      name: created.name,
      status: 'created_activation_failed',
      warning: 'Workflow was created but activation failed. Check the n8n dashboard; do not blindly retry creation.',
    };
  }
}
