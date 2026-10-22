# AI Automation Builder

**Describe an automation → generate a validated plan → preview a native workflow → approve deployment.**

A self-hostable automation-building engine that exposes the same capabilities to Claude, Codex, Cursor, other MCP clients, a CLI, and a token-protected HTTP API. Written in dependency-free Node.js 22 ESM.

> **v0.1.0 scope:** n8n workflow creation and optional activation are implemented. Portable JSON plans and previews are implemented. Make, Zapier, and Activepieces are **not** yet connected. This release does not claim to build arbitrary workflows on every platform.

## What works today

- Natural-language planning through an operator-configured OpenAI-compatible chat-completions endpoint.
- Strict portable AutomationSpec v1 validation and n8n workflow compilation.
- Manual, inbound webhook, and cron triggers; sequential static HTTPS HTTP steps.
- Read-only planning/preview; explicit `approved: true` for workflow creation; separate `activate: true` opt-in.
- Hostname allowlists, URL validation, credential isolation, local-only API default, bearer authentication, and request limits.
- MCP stdio, CLI, and REST interfaces, tests, Docker image definition, and release CI.

## Requirements

- Node.js 22 or later.
- An OpenAI-compatible chat-completions API key and model for natural-language planning (not required for preview/deploy of existing JSON).
- An n8n instance with public API enabled and an API key for deployment.
- Permission to create workflows on that n8n instance.

## Quick start

```bash
git clone https://github.com/fernandogarzaaa/AI-Automation-Builder-.git
cd AI-Automation-Builder-
cp .env.example .env
# Edit .env: AI_API_KEY, AI_MODEL, N8N_BASE_URL, N8N_API_KEY,
# and AAB_ALLOWED_ACTION_HOSTS. Never commit .env.
node --env-file=.env src/cli.mjs providers
node --env-file=.env src/cli.mjs plan "When I manually run this, POST a JSON message to https://httpbin.org/post"
node src/cli.mjs preview examples/automation.json
node --env-file=.env src/cli.mjs deploy examples/automation.json --approve
# Only if you also want to enable the workflow:
node --env-file=.env src/cli.mjs deploy examples/automation.json --approve --activate
```

**Caution:** Running deploy twice creates two workflows. The example uses httpbin.org; add `httpbin.org` to `AAB_ALLOWED_ACTION_HOSTS` for a real deployment. Activation is not required for draft creation.

## MCP: Claude, Codex, Cursor and compatible clients

The server uses the Model Context Protocol over stdio. No vendor-specific plugin SDK is needed.

**Claude Desktop**: Add to your MCP configuration, using an absolute local path:

```json
{
  "mcpServers": {
    "ai-automation-builder": {
      "command": "node",
      "args": ["--env-file=/ABSOLUTE/PATH/AI-Automation-Builder-/.env", "/ABSOLUTE/PATH/AI-Automation-Builder-/src/mcp.mjs"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add --transport stdio ai-automation-builder -- node --env-file=/ABSOLUTE/PATH/AI-Automation-Builder-/.env /ABSOLUTE/PATH/AI-Automation-Builder-/src/mcp.mjs
```

**Codex**: Add to your `config.toml`:

```toml
[mcp_servers.ai-automation-builder]
command = "node"
args = ["--env-file=/ABSOLUTE/PATH/AI-Automation-Builder-/.env", "/ABSOLUTE/PATH/AI-Automation-Builder-/src/mcp.mjs"]
```

Cursor and other MCP hosts use the same command/args pattern. Use an absolute path. Never place real secrets in a committed MCP config.

Available MCP tools:

| Tool | Effect |
| --- | --- |
| `automation_providers` | Read current provider capability matrix |
| `automation_plan` | Generate and validate JSON from natural language |
| `automation_preview` | Validate and compile an n8n workflow without creating it |
| `automation_deploy` | Create n8n workflow only with explicit approval; activation separate |

Example conversation: *"Plan a webhook-triggered workflow that POSTs to my documented HTTPS endpoint. Show me the preview. Do not deploy until I approve."*

## HTTP API

Set `AAB_API_TOKEN` to a random string of at least 24 characters, then:

```bash
node --env-file=.env src/api.mjs
curl -s http://127.0.0.1:8787/healthz
curl -s -H "Authorization: Bearer $AAB_API_TOKEN" http://127.0.0.1:8787/v1/providers
curl -s -X POST http://127.0.0.1:8787/v1/preview \
  -H "Authorization: Bearer $AAB_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spec":{"version":1,"name":"Example","description":"Demo","trigger":{"type":"manual"},"actions":[{"id":"post","type":"http","method":"POST","url":"https://httpbin.org/post","body":{"ok":true}}]}}'
```

Endpoints: `GET /healthz`, `GET /v1/providers`, `POST /v1/plan` (body `{"prompt":"..."}`), `POST /v1/preview` (body `{"spec":{...}}`), and `POST /v1/deploy` (body `{"spec":{...},"approved":true,"activate":false}`). API binds to `127.0.0.1` by default. Use a TLS reverse proxy, authentication and network policies before remote exposure.

## Portable AutomationSpec v1

```json
{
  "version": 1,
  "name": "Notify service",
  "description": "Send a static JSON payload",
  "trigger": { "type": "manual" },
  "actions": [
    {
      "id": "send",
      "type": "http",
      "method": "POST",
      "url": "https://httpbin.org/post",
      "headers": { "content-type": "application/json" },
      "body": { "message": "Hello" }
    }
  ]
}
```

Supported triggers: `manual`, `webhook` (requires lowercase `path`), `schedule` (requires five-field `cron`). Supported actions: `http` with HTTPS URLs, static JSON body, and non-secret headers. Sequential steps only. **No credential references, dynamic mappings, branching, loops, custom code, or provider-specific nodes in v0.1.** The planner refuses to fabricate unspecified endpoint URLs.

## Security and production boundaries

- **Plan → preview → human review → create draft → optional activation** is the required workflow.
- Allowlist every action destination hostname in `AAB_ALLOWED_ACTION_HOSTS`. This is an exact-match list, not wildcard matching.
- API credentials stay in local environment variables. Sensitive HTTP authorization headers are rejected from generated workflow specs.
- No private or literal-IP action hosts, HTTP action URLs, or provider expressions.
- Static hostname checks cannot prevent DNS rebinding or remote redirect abuse. Use network-layer egress controls on the **n8n worker**, block private CIDRs, and restrict redirect behavior before using untrusted automation inputs.
- n8n may execute workflows with the permissions of its own instance. Use a dedicated least-privilege instance, audit changes, and separate production credentials.
- This project does not automatically publish a hosted SaaS service, provision provider accounts, or obtain OAuth grants.

Read [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Verification and release

```bash
npm run check
npm test
```

GitHub Actions checks syntax and tests on pushes and pull requests. After successful verification of a push to `main`, it attempts to publish GitHub Release `v0.1.0` if it does not already exist. Release publication depends on repository Actions and `GITHUB_TOKEN` permissions.

## Roadmap

Add an OAuth credential broker, declarative typed mappings, more native action types, durable idempotency and job state, provider-specific adapters (Activepieces, Make, Zapier), approval/audit persistence, and hosted multi-tenant authentication. These are roadmap items, **not shipped capabilities**.

MIT licensed.
