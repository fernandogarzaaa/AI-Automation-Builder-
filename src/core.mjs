import { validateSpec } from './spec.mjs';
import { compileN8n } from './n8n.mjs';

export function providers() {
  return [
    { id: 'n8n', capability: 'compile_and_create', activation: 'manual_in_provider_console', status: 'implemented' },
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

