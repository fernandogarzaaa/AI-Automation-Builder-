# Assurance and regression gates (v0.3.0)

Both tools are integrated into CI, not merely listed as recommendations. Production is NOT certified by this release.

## TestTeeth — mutation quality

- Source: https://github.com/fernandogarzaaa/testteeth ; PyPI testteeth 0.2.0.
- Actual JavaScript mutation engine: StrykerJS 9.0.0 (TestTeeth dispatches to it).
- Block at mutation score below 80%, crash, baseline test failure, engine missing, or malformed report.
- Measured scope: `src/spec.mjs` and `src/security.mjs`. This is deliberately narrower than the entire system; it does not qualify persistence, MCP or network integration.
- Tests include a frozen 36-case specification contract and unit suites.
- Mutation evidence is attached as `testteeth-mutation` on each CI run; inspect survived and uncovered mutants before changing the threshold.
- Run locally after `pip install testteeth==0.2.0` and `npm install --no-save @stryker-mutator/core@9.0.0`:

```bash
npm test
testteeth run src/spec.mjs src/security.mjs --lang typescript --fail-under 80 --workers 2 --no-coverage --json mutation.json
testteeth suggest src/spec.mjs src/security.mjs --lang typescript --limit 20
```

## Genesis — behavior and evaluator quality

- Pinned source: https://github.com/fernandogarzaaa/genesis at commit `8871e2988f3dab4bab029aa8e3c131172daa826a`.
- Runs 36 predefined cases against the actual source validation and allowlist functions, without using the reference labels in the subject.
- Dataset includes 8 valid and 28 invalid cases covering URL policy, trigger syntax, action types, headers, expressions, IDs, schema size and deployment host allowlist.
- Genesis `gate` requires 100% case accuracy and its independent evaluator assurance to be SOUND on synthesized control/exploit probes.
- Evidence bundle is uploaded as `genesis-evidence` from the same GitHub Actions run. Inspect the claim verdict, case-level trial results, and evaluator findings before interpreting release.
- Re-run from the repository root with Genesis built from the pinned checkout:

```bash
node .tools/genesis/bin/genesis.js gate evaluations/automation-spec/evaluation.yaml --out reports/genesis --json
```

## What remains out of scope

These deterministic tests cannot prove natural-language planning success, external provider API compatibility, n8n execution isolation, non-stub credentials, production OAuth or multi-tenant security. No live n8n sandbox was configured here. The active blocker list in `docs/PRODUCTION_GATES.md` still applies.

## Fail-closed release policy

PRs must pass `verify`, `genesis`, and `mutation`. A v0.3.0 GitHub Release is created on main only if all jobs pass. A missing, cancelled, timed-out, or failed job is not a pass. Evidence from this release is limited to the exact code and benchmark corpus; new provider adapters must be independently qualified.
