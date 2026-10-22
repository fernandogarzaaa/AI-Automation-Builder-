# AI Automation Builder

**Describe it → validate a portable plan → preview it → approve locally → create an inactive workflow.**

[![Verify and release](https://github.com/fernandogarzaaa/AI-Automation-Builder-/actions/workflows/ci-release.yml/badge.svg)](https://github.com/fernandogarzaaa/AI-Automation-Builder-/actions/workflows/ci-release.yml)

AI Automation Builder (AAB) is a self-hostable MCP + CLI + HTTP system that turns natural-language instructions into an audited *workflow draft*. It targets Claude, Codex, Cursor, and any compatible stdio MCP client.

**Assurance candidate: v0.3.0 (publish only after gates succeed).** n8n is the sole implemented deployment target. Make, Zapier, Activepieces, Pipedream, and other platforms need separate, version-tested adapters, permission grants, and credential brokers. It is **not** a hosted universal automation service or a verified production SaaS.

## Implemented

- Dual release gates: TestTeeth + StrykerJS mutation score ≥80% on security-critical code, and Genesis labeled policy/assurance gate (30 preregistered cases, 12 accept / 18 reject plus an always-accept negative control).
- Strict `AutomationSpec v1` plan validation. Optional natural-language planner using an OpenAI-compatible chat-completions model. Models cannot supply credentials or arbitrary executable code.
- n8n native workflow JSON compiler: manual, webhook and five-field cron triggers, with sequential static HTTPS API requests (GET, POST, PUT, PATCH, DELETE).
- Stdio MCP server, CLI, and local bearer-protected HTTP API.
- Durable SQLite approval receipts, thirty-minute expiry, preview fingerprints, audit events, exact destination-host allowlist.
- **Operator-only interactive approval:** the LLM-accessible MCP/REST interfaces cannot grant approval.
- Unique preview claims and idempotency keys prevent duplicate POSTs on retries. Ambiguous outcomes are recorded as `uncertain` and require reconciliation.
- Draft creation is always **inactive**. Activate the workflow manually in n8n after its own review. CLI cannot silently activate it.

## Prerequisites

Node.js 22.13+ (Node.js 24 recommended), a running n8n instance with its API enabled and key, and an AI provider/model for natural-language planning. No third-party npm dependencies are required.

```bash
git clone https://github.com/fernandogarzaaa/AI-Automation-Builder-.git
cd AI-Automation-Builder-
cp .env.example .env
# Set AAB_ALLOWED_ACTION_HOSTS, N8N_BASE_URL, N8N_API_KEY.
# For natural language also set AI_API_KEY and AI_MODEL.
node --env-file=.env src/cli.mjs providers
node --env-file=.env src/cli.mjs plan "When I manually start it, POST JSON to https://httpbin.org/post"
node --env-file=.env src/cli.mjs preview examples/automation.json
```

The `preview` result includes a `previewId`, `fingerprint`, and `idempotencyKey`. Inspect every action, hostname and static payload, then *in your own terminal*:

```bash
node --env-file=.env src/cli.mjs inspect PREVIEW_ID
node --env-file=.env src/cli.mjs approve PREVIEW_ID
# Interactive terminal required; asks you to type a random confirmation.
node --env-file=.env src/cli.mjs deploy PREVIEW_ID IDEMPOTENCY_KEY
node --env-file=.env src/cli.mjs status IDEMPOTENCY_KEY
```

**Use the same state database and OS user in CLI, MCP and HTTP.** Set `AAB_STATE_PATH` to a shared absolute *local* file path if different processes use different environments. The default is `~/.ai-automation-builder/state.sqlite`. Back it up and restrict access; it contains workflow plan data. Do not run it over network filesystems or use as a multi-host job queue.

## Install for Claude and Codex (MCP stdio)

The plugin is a **standard MCP server**, not a proprietary Claude or Codex plugin package.

Claude Code:

```bash
claude mcp add --transport stdio ai-automation-builder -- node --env-file=/ABSOLUTE/PATH/.env /ABSOLUTE/PATH/src/mcp.mjs
```

Codex `config.toml`:

```toml
[mcp_servers.ai-automation-builder]
command = "node"
args = ["--env-file=/ABSOLUTE/PATH/.env", "/ABSOLUTE/PATH/src/mcp.mjs"]
```

Claude Desktop/Cursor use the equivalent MCP stdio command and args. The server currently implements the 2025-era MCP initialization handshake, not the incompatible 2026-07-28 stateless `server/discover` transport.

MCP tools: `automation_providers`, `automation_plan`, `automation_preview`, `automation_inspect`, `automation_deploy`, `automation_status`. An AI host can prepare and deploy an **approved** preview but it has no tool that can approve one. An operator must run `approve` locally.

## HTTP API

Start with `AAB_API_TOKEN` set to at least 24 random characters. It binds to `127.0.0.1:8787` by default. Non-loopback binding requires `AAB_REMOTE_API_EXPLICIT_OPT_IN=true` and a separate TLS/authentication gateway.

- `GET /healthz` unauthenticated.
- `GET /v1/providers`, `GET /v1/previews/:previewId`, `GET /v1/deployments/:idempotencyKey` require `Authorization: Bearer <token>`.
- `POST /v1/plan` accepts `{"prompt":"..."}`.
- `POST /v1/preview` accepts `{"spec":{...},"provider":"n8n"}`.
- `POST /v1/deploy` accepts `{"previewId":"...","idempotencyKey":"..."}`. No legacy `approved: true` or `activate: true` bypass.

There is intentionally **no HTTP or MCP approval endpoint**.

## Spec and current limits

```json
{
  "version": 1,
  "name": "Service notification",
  "description": "Send a static payload",
  "trigger": { "type": "manual" },
  "actions": [{
    "id": "notify",
    "type": "http",
    "method": "POST",
    "url": "https://httpbin.org/post",
    "headers": { "content-type": "application/json" },
    "body": { "message": "Hello" }
  }]
}
```

Static actions only; **no OAuth account connections, conditionals, dynamic field mapping, loops, typed native service actions, attachments, error routes, execution verification, or portable imports of provider-native workflows.** The planner requires an actual documented HTTPS endpoint; it does not invent one.

## Production limitations

**Do not treat a green CI run as a successful real-provider qualification.** AAB has not been verified end-to-end against a real n8n instance or multiple automation vendors in this chat. The n8n worker needs egress firewall rules blocking private networks, DNS-rebinding and redirect abuse. The API needs TLS if exposed, platform keys need a secret manager, and SaaS use needs per-tenant auth, quotas, isolation and observability.

See [Production gates](docs/PRODUCTION_GATES.md), [Security](SECURITY.md), and [Architecture](docs/ARCHITECTURE.md).

```bash
npm run check
npm test
```

The release workflow creates tag `v0.3.0` **only after unit tests, TestTeeth mutation, and Genesis assurance all succeed**. Any failure or missing evidence blocks publication. The suite's results are GitHub Actions artifacts. Live credentials are never used in unit tests.

MIT licensed.

## TestTeeth + Genesis qualification

The independent test harnesses are sourced from [testteeth](https://github.com/fernandogarzaaa/testteeth) and [genesis](https://github.com/fernandogarzaaa/genesis). CI pins TestTeeth 0.2.0, StrykerJS 9.6.0 and Genesis commit `8871e2988f3dab4bab029aa8e3c131172daa826a`.

Read [the dual-gate spec](assurance/README.md) and [production qualification gates](docs/PRODUCTION_GATES.md). A passing static-policy evaluation does not establish live n8n API compatibility, runtime security, or cross-platform production readiness.
