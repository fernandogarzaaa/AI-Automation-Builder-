# Security policy and residual risks

Report vulnerabilities privately to the maintainer using GitHub's private reporting feature when available. Do not paste tokens or exploit details into issues.

## Security controls implemented

- Strict allowlist for HTTPS action hosts and validation of portable workflow steps; no provider expressions, untrusted code, or inline credential headers.
- Local terminal approval with random confirmation code; preview expires in 30 minutes.
- Preview fingerprint, SQLite-backed audit events, one deployment per preview and persistent idempotency keys.
- All n8n creations inactive. Activation must be done separately in the n8n dashboard.
- HTTP API bearer authentication, small request limits, per-IP throttling and loopback-only default.
- Keys from environment variables; not returned in MCP or REST results.

## Residual risks and requirements

- **SSRF**: Allowlisting a hostname is not enough. n8n runs the HTTP action independently, and allowed DNS names may rebind or redirect to internal networks. Apply **network-level egress restrictions on n8n workers**, including metadata and private CIDRs.
- **Secrets**: Plaintext workflow payloads and data exist in the local SQLite state store. Secure the host, encrypt backups, manage retention and use dedicated credentials. Do not place secrets in URLs or bodies.
- **Integrity/consent**: Approval is bound to a spec fingerprint and a local interactive terminal, but there is no cryptographic operator identity, separation of duties or remote approval UI.
- **Failures**: POST timeouts can leave an uncertain result. Never blindly retry with a new idempotency key. Reconcile against n8n before corrective action.
- **Distributed use**: SQLite is a single-host store, not a distributed consensus service. Do not use multi-replica app servers against a shared network filesystem.
- **Remote API**: Do not expose without a vetted TLS reverse proxy, OIDC authorization, quotas, audit and abuse controls.
- **MCP**: Tool annotations are hints, not authorization. The server enforces an approval record regardless of tool caller assertions.
- **Vendor compatibility**: Native n8n API payloads are subject to version changes. Run E2E tests in staging before production.

See [PRODUCTION_GATES](docs/PRODUCTION_GATES.md).
