# Security policy

## Reporting vulnerabilities

Please use GitHub's private vulnerability reporting feature if enabled for this repository. Otherwise contact the repository maintainer privately. Do not publish secrets, exploit details or real access tokens in an issue.

## Threat model

AI-generated plans and natural-language prompts are untrusted input. The n8n deployment API can create executable workflows. AAB therefore validates a restricted intermediate representation and separates planning, previewing, creation and activation.

### Controls implemented

- Deployment requires explicit `approved: true`; activation additionally requires `activate: true`.
- Exact hostname allowlist for action endpoints, HTTPS-only actions, no literal-IP or internal-domain destinations.
- Rejects inline Authorization/Cookie/API-key headers, n8n expressions, and arbitrary code.
- Server bearer authentication, loopback default, request size and basic per-IP rate limits.
- API keys are read from environment variables and not returned in API or MCP results.
- Up to 20 sequential HTTP actions per workflow; static payloads only.

### Important residual risks

- **DNS rebinding and redirects:** URL string validation is not a substitute for runtime egress firewall rules. The n8n worker executes requests independently and may follow redirects or resolve an allowed domain to private IP space. Deny private CIDRs and metadata endpoints at the network layer.
- **Duplicate creation:** Creation is not idempotent. Repeating a deployment creates another workflow. Check the n8n dashboard before retrying after ambiguous failures.
- **Authentication:** HTTP API bearer tokens are not OAuth. Keep the API on loopback or behind a properly configured TLS/authentication gateway. Rotate compromised tokens.
- **Model output:** AI providers may hallucinate or misinterpret a request. Always review the preview and target API documentation before approval.
- **Provider privileges:** n8n API credentials should have minimum necessary scope and be isolated from production secrets where possible.
- **Logs and prompts:** Requests may contain confidential business data; use a trusted model endpoint and control retention at the provider.
- **Approval provenance:** This version relies on the calling client to capture human consent; it does not provide cryptographic approval attestations or persistent audit logs.

Do not treat this version as a multi-tenant automation service without adding per-user authorization, quotas, durable auditing, network isolation, and idempotency.
