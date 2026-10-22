# v0.2 security model

AAB uses a durable SQLite journal for preview receipts and one-deployment-per-preview idempotency. A caller (CLI, MCP or HTTP) first records a validated preview using `prepare()`. A human must approve it in an interactive local CLI (no MCP/REST approval operation). The deployment endpoint accepts the preview ID and idempotency key, performs a transactional unique claim, calls the n8n create API and persists an inactive workflow ID. If the result is ambiguous or the process exits mid-request, the journal refuses automatic repeat creation. Operators must reconcile `uncertain`/stale `in_progress` states against n8n manually. The approval expires in 30 minutes; existing idempotent responses remain retrievable after expiry.

n8n execution is independent of AAB; enforce outbound network policy on n8n workers. This is a single-host SQLite control plane, not a multi-tenant distributed service. Real vendor E2E qualification is still required.

---

# Architecture and adapter contract

```text
Natural-language prompt
    |
    v
AI chat-completions planner (optional)
    |
    v
Validated AutomationSpec v1  <--- JSON file / REST / MCP tool
    |
    +---- preview ----> n8n compiler ----> native workflow JSON
    |
    +---- local terminal approval + SQLite claim ----> n8n API create (inactive)
                                         |
                                         +---- activate manually in n8n
```

## Boundaries

- `src/spec.mjs`: strict schema, normalization, URL and expression safety.
- `src/security.mjs`: destination allowlist and provider base URL validation.
- `src/planner.mjs`: external AI model integration; output is untrusted until validated.
- `src/n8n.mjs`: pure n8n compiler and authenticated create/activate client.
- `src/core.mjs`: orchestration and capability reporting.
- `src/mcp.mjs`: MCP stdio JSON-RPC transport for Claude, Codex and other hosts.
- `src/api.mjs`: bearer-protected local REST interface.
- `src/cli.mjs`: human-operated command-line interface.

## Adding a provider

1. Define its supported triggers, actions, authentication requirements, quotas and limits.
2. Implement a pure compiler from `AutomationSpec` to the provider's native representation.
3. Add an API adapter that **creates a disabled draft** and returns a stable provider resource ID.
4. Implement activation as a separate operation and never infer permission from a prompt.
5. Test compilation with fixtures and deployment with mocked API responses.
6. Update `providers()` only after actual API integration is verified. Unsupported capabilities must fail closed.
7. Add network and OAuth credential isolation; never ask an LLM to generate secrets.

Future specs should add typed input/output mapping, conditionals, retries, idempotency keys, execution policy, provider-specific credential references, and explicit approval receipts. Changes must be versioned, not silently inferred.

## Integration strategy

MCP is the cross-client distribution surface; platform connectors are independent adapters behind a portable workflow IR. An MCP host is not itself an automation execution platform. Make, Zapier, Activepieces, Pipedream and similar systems require their own API contracts, permission models and credential provisioning. There is no honest universal one-click deployment API across all platforms.

## Operational checklist

Before production: enforce outbound firewall policy at the automation runtime, configure TLS for any remote API, store secrets in a managed secret store, set up telemetry/auditing, ensure n8n API credentials are least privilege, validate platform-specific workflow schemas against a staging instance, and implement durable deployment deduplication.
