# Live n8n staging qualification

This is an opt-in live provider gate, NOT executed by normal CI. A passing source CI run does not qualify any real instance.

Create a dedicated GitHub Environment named staging, protect it with required reviewer approval, and connect it to an isolated version-pinned n8n instance. Never use a production key or production n8n.

Environment secrets: N8N_STAGING_BASE_URL (HTTPS base URL) and N8N_STAGING_API_KEY (least privilege staging API key).

Environment variables: N8N_STAGING_EXPECTED_HOST (exact staging hostname), N8N_STAGING_ACTION_URL (public HTTPS GET endpoint for inactive workflow), N8N_STAGING_ALLOWED_ACTION_HOSTS (its exact domain allowlist).

From GitHub Actions manually run Opt-in n8n staging qualification. The script checks opt-in, exact destination hostname, action schema and action host allowlist BEFORE requests. It creates a uniquely named inactive draft, GETs it, verifies ownership, inactive status, nodes and edges, and deletes the new draft.

It never activates or executes the workflow. Unverified resource ownership blocks automatic deletion. A readback or deletion failure blocks qualification. Operators should inspect for workflow names beginning aab-staging-probe- if cleanup was unconfirmed.

Passing this limited check does not qualify webhook/schedule execution, n8n worker DNS egress, redirects, credentials, authorization, multi-platform integrations or production deployment.
