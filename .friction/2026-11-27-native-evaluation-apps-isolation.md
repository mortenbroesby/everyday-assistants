# Native evaluation retained connected application tools

- Date: 2026-11-27
- Scope: developer harness / Nemlig synthetic evaluation
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/372
- Revision: evaluation based on 843b3c9ef38764cac501547824a23d518f6b8af2 with uncommitted fixture extension
- Paths: docs/nemlig-selection-evaluation.md; apps/nemlig-assistant/scripts/agent-routing-fixture.ts
- Category: permissions
- Severity: high
- Status: investigating

## Observation and evidence

A native CLI synthetic selection batch disabled configured MCP servers and
installed plugins using process-only overrides. Three cases called the synthetic
`routing_fixture.find_groceries`. The fourth called
`codex_apps.nemlig_assistant.find_groceries` and returned live catalogue results.
Its synthetic fixture recorded zero searches. Disabling configured servers and
plugins had not disabled the separate connected-app feature. CLI feature
inspection subsequently showed `apps` enabled.

This live search exceeded the fulfilled four-call owner authorization. The trial
is invalid. The completed offending turn contained one search and no mutation
calls. On discovery, the active repeat batch was interrupted and process exit
verified. Its fixture recorded zero searches; the interrupted observer did not
persist partial native events, so its full call history is unavailable.

## Impact

One observed out-of-scope read-only live search; one invalid control trial.
Three completed synthetic cases remain exploratory evidence at their original
fixture revision. A repeat was interrupted. Additional cost was not measured.
No credentials, raw provider results or private transcripts are recorded here.

## Hypothesis

Strong evidence: native apps are a separate tool source from configured MCP
servers and installed plugins. Fixture-side network blocking protects the fixture
process only, not the native host. Exact tool exposure must be inspected before
the model turn; post-run inspection alone is too late.

## Improvement and validation

Use process-only native `features.apps=false` and `features.plugins=false` in
addition to disabling other servers. Before another model turn, enumerate all
MCP tool sources and fail closed if anything beyond the synthetic fixture is
available or pagination is incomplete. Verify this metadata without a model
turn first. Preserve partial events on interruption and inspect actual server
identity for every call. Do not infer host isolation from fixture counters.

## Resolution

Pending preflight verification and bounded fixture-only rerun. Keep this failure
as a regression requirement for the native evaluation procedure. No global
configuration change, merge, deployment or further live query is authorized.

Metadata-only preflight with both native feature overrides succeeded: 11 fixture
tools, zero tools on every other server row, no pagination. The bounded rerun
now checks this before every turn and preserves partial events. Completion and
selection outcomes remain recorded separately in the selection evaluation.
