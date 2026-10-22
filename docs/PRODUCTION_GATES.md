# Production qualification gates — v0.2.0

This checklist distinguishes implemented code from demonstrated operational safety. **CI success does not equal production approval.**

| Gate | Status | Evidence needed before a production claim |
| --- | --- | --- |
| Source checks and mocked tests | Implemented | GitHub Actions green on exact release SHA |
| TestTeeth mutation kill rate ≥80% | CI configured; actual outcome pending | StrykerJS evidence JSON, nonempty mutant set, hard fail below threshold |
| Genesis policy safety evaluation | CI configured; actual outcome pending | 30 independent fixtures, SOUND evaluator, negative control, signed-off evidence bundle |
| True n8n draft creation | UNVERIFIED | Authorized staging n8n API creates expected workflow; GET verifies the exact nodes/edges |
| True n8n workflow runtime | UNVERIFIED | Activate in sandbox and observe webhook/manual/schedule execution, retries and failures |
| Real provider API permission matrix | UNVERIFIED | Test n8n API scopes/version; ensure least-privilege roles and disabled-by-default |
| Network isolation/SSRF | UNVERIFIED | n8n worker egress denies private ranges, metadata IP, unexpected redirects and DNS rebinding |
| Backup/restore | UNVERIFIED | Test SQLite journal backup, crash recovery and restore timing |
| Secret management | UNVERIFIED | Rotate n8n/model keys; managed secret store for deployed hosting |
| Authentication | LOCAL ONLY | Token on local REST API; remote TLS+OIDC/tenant isolation not implemented |
| Duplicate deploy prevention | Implemented | SQLite unique constraints, idempotency and crash/timeout tests; reconcile uncertain statuses manually |
| Human approval | Implemented with limits | Local terminal confirmation only; no cryptographic signing or distinct human identity in headless mode |
| Telemetry and disaster recovery | UNVERIFIED | Metrics, alerts, logs without secrets, operator runbooks |
| SLO/load testing | UNVERIFIED | Define and measure error budgets and concurrent workflows |
| n8n/Make/Activepieces/Zapier integrations | n8n only | Implement and qualify each adapter against its actual versioned API |

## Release/rollout discipline

1. CI syntax and unit tests on all changes. Check the exact release tag SHA.
2. Staging instance isolated from production data, least-privileged API key, egress-deny defaults.
3. Complete documented staging E2E tests with a reversible workflow.
4. Run failure injection: timeouts after creation, duplicate messages, SQLite crash/restart, bad credentials, provider outage, denied egress.
5. Define operating runbook: inspect `uncertain` deployments in provider dashboard before resuming. Do not retry with a fresh key.
6. Only after passing every applicable gate promote to production with human signoff. Never activate a workflow without reviewing its provider-native representation.

## Architecture decision

MCP is the interface used by Claude, Codex and Cursor. The execution platform is separate. Each provider needs its own compiler, API contract and permissions. The release currently ships a single adapter, **n8n**, rather than inventing support for other providers.

Referenced public API documents:
- n8n REST API: https://docs.n8n.io/api/
- Activepieces flow creation: https://www.activepieces.com/docs/endpoints/flows/create
- Make scenario creation: https://developers.make.com/api-documentation/api-reference/scenarios
- MCP tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
