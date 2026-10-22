# v0.3.0 — Genesis and TestTeeth assurance gates

Release of a **narrow, evidence-backed validation layer**, not a production-readiness certification.

- Adds a frozen 36-case AutomationSpec validator and destination allowlist contract suite.
- Integrates TestTeeth 0.2.0 and StrykerJS 9.0.0, with fail-under 80% mutation score on `src/spec.mjs` and `src/security.mjs`.
- Integrates pinned Genesis 0.4.0 source, its exact-answer evaluations, and its adversarial evaluator-assurance release gate.
- Publishes Genesis and mutation evidence as Actions artifacts and blocks the release until syntax, unit, Genesis, and TestTeeth gates pass.
- Documents measured scope, claim boundaries, and failures that must not be misrepresented as passes.

**Still unverified:** Real n8n sandbox execution, live provider credentials/permission matrix, egress firewall/SSRF protections at runtime, OAuth, backup/restore, and production operations. Make/Activepieces/Zapier still have no live adapters. The current scope remains n8n-only.
