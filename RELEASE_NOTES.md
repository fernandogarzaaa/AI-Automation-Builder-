# v0.2.0 — Durable, operator-gated automation creation

**Security and reliability release, not universal-platform GA.**

- SQLite-backed preview receipts, plan digests and audit events.
- Strict 30-minute approval expiry and operator-only interactive approval through the local CLI.
- Atomic claim of one deployment per preview, persistent idempotency keys and no automatic POST replay after uncertain outcomes.
- Status and preview inspection exposed to MCP/REST.
- Remove publicly model-callable `approved: true` and `activate: true` deployment shortcuts.
- Creation produces an inactive n8n workflow; activation is performed in n8n after separate review.
- Correct MCP handshake compatibility claim: 2025-11-25 and 2025-06-18 only.
- Node 24 CI, syntax and regression checks, explicit release gates.

**Breaking change:** `automation_deploy` and `POST /v1/deploy` now take `previewId` and `idempotencyKey` after a local `approve`. CLI `deploy spec.json --approve` is removed. Consult README.

**Not qualified:** Real n8n sandbox execution, network egress enforcement, OAuth connection provisioning, multi-tenant security, operational SLOs, and other vendor adapters. See docs/PRODUCTION_GATES.md.
