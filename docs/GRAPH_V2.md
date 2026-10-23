# Workflow graph schema v2 (bounded initial slice)

`version: 2` represents a single, connected, acyclic chain of HTTP actions, with explicit `next` references. Unlike v1, actions may appear in any array order when edges are provided.

## Routing semantics

- **No `next` anywhere:** the compiler generates a linear chain in array order, like v1.
- **At least one `next`:** each `next` identifies the following action by ID. An omitted or null `next` indicates a terminal action. The compiler identifies the unique entry node by indegree and connects the n8n trigger to that action.
- Exactly one entry, one terminal and one connected acyclic path are required. Unknown destinations, cycles, self-links, forks, merges and orphan steps are rejected.

Example: actions `[{id:"second",next:null,...},{id:"first",next:"second",...}]` compile as `Start → first → second`.

The original v1 schema is unchanged. Conditional branching, interpolation, retries, secrets, external credentials and richer action types **are not implemented**. The v2 graph itself is not yet qualified against a live, version-pinned n8n staging environment. For now the contract is limited to validation and deterministic compilation.
