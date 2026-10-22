# Provider readback verification

Workflow creation now performs a separate n8n GET by returned workflow ID before marking a deployment as \`created_inactive\`. It compares executable node types, versions, node parameters, graph edges and checks that the provider reports \`active: false\`.

A rejected, unreachable or mismatched readback transitions the deployment to **uncertain**, not success, and never automatically repeats workflow creation. Manual operator reconciliation in n8n remains necessary. The operation does not activate an automation.

**Boundaries:** This is a mocked contract test until a version-pinned staging n8n instance is qualified. n8n may normalize node parameters when persisting; such incompatibility will deliberately block deployment rather than incorrectly declare success. Runtime HTTP requests remain subject to n8n worker egress protections that this project cannot enforce remotely.

To qualify against staging: set N8N_BASE_URL and N8N_API_KEY in an isolated secret store, use an isolated n8n instance, deploy a reversible workflow, read its native graph, verify inactive, and test negative cases. Do not use production credentials for first qualification.
