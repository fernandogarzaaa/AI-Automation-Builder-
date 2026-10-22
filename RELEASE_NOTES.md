# v0.1.0 — Initial automation-builder engine

First release of AI Automation Builder.

- Portable, validated AutomationSpec v1 with strict URL and header rules.
- AI natural-language planner using configurable OpenAI-compatible chat completions.
- Native n8n workflow preview, draft creation and separately approved activation.
- MCP stdio tools for Claude, Codex and other MCP hosts.
- Local bearer-protected REST API and CLI.
- Syntax checks, unit/integration-style mocked tests, and automated GitHub Release workflow.
- Security documentation and provider capability matrix.

**Known limitations:** n8n is the only live deployment adapter. Make, Zapier and Activepieces are planned. No OAuth broker, runtime execution verification, dynamic mappings, branching, idempotency, or multi-tenant hosted service. Review every workflow before activation.
