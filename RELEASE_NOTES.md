# v0.3.0 — TestTeeth + Genesis assurance gates

Release publication is conditional on all gates passing on the exact main branch SHA.

- TestTeeth 0.2.0 drives StrykerJS 9.6.0 to mutation-test security-critical JS logic and enforces a hard 80% kill threshold. Empty, errored and cancelled runs are not accepted.
- Genesis 0.4.0 (pinned immutable source revision) evaluates AAB's policy compiler against 30 independently labeled safe and unsafe plans, assures its evaluator, and requires a passing negative control.
- Both tools produce downloadable GitHub Actions evidence artifacts. The release job depends on both gates and ordinary unit tests.
- Documented exact fixture population, evaluation assumptions, and limits of all gate claims.

**Still unqualified for production:** full live-provider sandbox integration; n8n API schema/version proof; worker egress firewalls and DNS-rebinding defenses; multi-tenant OAuth and secret management; distributed deployments; other vendor adapters. These gates measure static quality and policy behavior only.
