# Dual independent release qualification

## TestTeeth 0.2.0 + StrykerJS

TestTeeth drives StrykerJS against the security-sensitive JS modules and fails the gate if less than **80%** of mutants are killed. Never interpret engine failure, missing native dependencies, no mutants, or a cancelled job as a pass.

CI installs testteeth 0.2.0 and @stryker-mutator/core 9.6.0, then runs:

```sh
testteeth run src/spec.mjs src/security.mjs src/state.mjs src/operations.mjs \
  --lang typescript --engine-config stryker.config.json \
  --fail-under 80 --json ./testteeth-report.json
```

The measured score is not presumed in advance. All mutants in those modules are candidates, so runtime may be considerable. A green unit-test suite is necessary, not sufficient.

## Genesis 0.4.0

Genesis is built from pinned repository SHA `8871e2988f3dab4bab029aa8e3c131172daa826a`, with the exact evaluation input committed in `policy.eval.json`.

```sh
genesis gate assurance/policy.eval.json --out genesis-evidence
node assurance/check-genesis-results.mjs genesis-evidence
genesis verify genesis-evidence/evaluation
```

The fixture contains **30 independently labeled cases**, including valid manual/webhook/cron workflows and denied internal URL access, unknown action types, credentials and injected expressions. Genesis must obtain a supported system claim and a SOUND evaluator. The always-accept negative-control subject must score at most 50% accuracy; otherwise the CI test is suspect. The output is an inspectable evidence bundle.

These tests assess a **static workflow planner and compiler policy**, not the security of a real n8n worker, the model's natural-language understanding, OAuth grants, cross-platform functionality or production end-to-end reliability.

## Production block list

Even with green TestTeeth and Genesis, promotion to production still requires a live, isolated n8n staging instance; n8n schema compatibility; worker egress restrictions; DNS-rebinding and redirect controls; provider-side reconciliation; backup/restore evidence; tenant isolation and operator signoff. See `docs/PRODUCTION_GATES.md`.
