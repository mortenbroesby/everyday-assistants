## Context

Evidence baseline: remote main `7245d096afcc5e684d38473c9c91dc981636acce`, inspected 2026-09-08 in an isolated worktree. See `proposal.md` for the outcome. The archived maintenance report explicitly deferred output-schema tightening and saved-plan retirement; it already removed duplicate error boundaries and indexed basket quantities. Those completed refactors are not repeated here.

Planning verification: `pnpm verify` passed all 179 tests, lint, build, typecheck and smoke. Its coverage stage explicitly reported `0 total` tasks and `No tasks were executed as part of this run`; this confirms the coverage gap rather than supplying coverage evidence. Strict OpenSpec validation passed all 14 current items and the public-tree check passed. No runtime source, dependency manifest or lockfile changed during planning.

| Finding | Concrete evidence | Priority / proposed treatment |
| --- | --- | --- |
| Release argument parser duplicates an installed library | `release/agent.ts:199-211` manually walks flags; app dependencies include Commander 15 | P2: reuse Commander behind the existing command boundary |
| Product text conversion is not an HTML parser | `src/client.ts:99-102`, called by `normalizeProducts` for `Text` and `Attributes` | P2: bounded HTML-to-text adapter |
| Coverage can appear successful without a report | root `coverage` invokes `turbo coverage`; app package has no coverage script | P2: wire a real Node coverage report before setting a baseline |
| List result schemas accept arbitrary values | `src/mcp.ts:562,583,602,621,669` use `z.any()` | P2: public response schemas and serialization contract tests |
| Backlog and artifact lifecycle disagree | automatic-grocery backlog says active change although corresponding work is archived; other active changes retain acceptance tasks | P2: reconcile evidence without treating local tests as production acceptance |

Paths above are relative to `apps/nemlig-assistant` unless described as root. Source line numbers identify the baseline, not permanent anchors.

## Goals / Non-Goals

Use existing modules and plain functions as seams. Keep public tool names, valid CLI invocations, stored data, ownership, request budgets, mutation authorization, and price revalidation stable. Only the two explicit MCP additions in this proposal change behavior/contracts. Malformed release arguments must fail before actions; document any newly rejected malformed form.

Do not use file length as a reason to split modules. No generic repository base class, plugin registry, dependency-injection container, state-machine framework, event bus, or schema factory. No retirement of externally callable tools within this change.

## Decisions

### 1. Reuse Commander for the release command

This is the first small cleanup: `parseArgs` duplicates argument classification, missing-value handling, defaults, and errors. The main CLI already uses Commander. Build one command definition locally, retain `createReleasePlan` as the functional policy core, and leave side effects in the existing entry point. Configure thrown parser errors for unit tests rather than process termination.

Characterize no arguments, each valid flag, combined flags, explicit refs, unknown flags, absent values, repeated flags, and a flag used accidentally as another flag's value. In particular, Commander treats `--no-release` as a negated `release` option; explicitly map it to the existing `noRelease` field, whose absent/present semantics must stay intact. A parser replacement must not accidentally initiate apply, consume an action flag as a ref, or write output before validation.

Alternative: Node `util.parseArgs` is sufficient for many scripts and preferred when no CLI dependency exists. Here Commander is already used and gives the same command conventions across the app. Do not introduce a wrapper shared by unrelated one-argument scripts merely for consistency.

### 2. Replace the HTML regex with a real parser-backed converter

Synthetic inputs run through the exact current expression produced these results (not a claim about observed live payloads):

| Input | Current result | Intended text |
| --- | --- | --- |
| `<p>Mælk &amp; kakao&nbsp;1 l</p>` | `Mælk &amp; kakao&nbsp;1 l` | `Mælk & kakao 1 l` |
| `<p title="1 > 0">Agurk</p>` | `0">Agurk` | `Agurk` |
| `<script>tracking()</script><p>Agurk</p>` | `tracking() Agurk` | `Agurk` |

Recommend npm **`html-to-text`**, registry version **10.0.1** at inspection. MIT, Node >=20.19.0 (compatible with our declared Node 22.23.1); five direct dependencies; package's own unpacked size 180,659 bytes, which excludes its dependency tree and is not bundle size. Its documentation supports compiled reusable conversion, entity decoding, skipped elements and bounded processing. This replaces an invented HTML parser, not a performance-proven bottleneck.

Compile options once in the product normalization boundary, disable wrapping, omit script/style/image content and link destinations, collapse whitespace and keep the existing 2,000-character description, 100-character attribute-key, 300-character attribute-value and 20-attribute limits. Use a pre-conversion raw-input cap of 16,384 UTF-16 code units per field, depth 32 and 1,000 child nodes per node; truncate locally so the converter's oversize warning does not create protocol/log noise. Preserve missing/empty-field omission. Output is untrusted plain text, never trusted HTML; retain picker escaping/text insertion and image allowlisting.

Adoption gate: use synthetic fixtures, inspect exact-version exports/types/transitive dependencies and advisories, measure installed and packaged byte delta, cold import and repeated conversion time against the same fixtures, and prove no requests or logging are added. Record measurements without calling a parser faster than a regex. If packaging or material operating cost fails this gate, revise this slice before installing into production scope.

Alternatives: `entities` fixes entity decoding but leaves the broken HTML regex; a DOM emulator adds browser machinery; direct `htmlparser2` requires maintaining text formatting/traversal rules. A small configured converter is the clearest initial choice. Keep the existing seven-line `mapLimit` for now: swapping it for a concurrency package saves little and risks changing rejection/request scheduling.

### 3. Make verification claims executable

Use the existing Node test runner's coverage capability through the installed TS execution path. Confirm source-file attribution and exclusions for tests/generated outputs on pinned Node, then capture a baseline. Do not invent a coverage percentage from test counts or add a test framework. Keep `test` useful on its own; measure whether running test plus coverage repeats the entire suite before altering root verification. The full gate must still execute every required suite once or report explicit reuse, and must fail if expected coverage output is missing.

### 4. Strengthen the public list boundary using installed Zod

Trace actual list serializers and existing storage schemas before changing `mcp.ts`. Define the smallest schema for each externally returned list/summary shape; reuse only genuinely identical public fields. Do not export the persisted owner scope or encryption/internal metadata just to reuse a storage schema. This is an explicit DTO boundary, not a generic schema factory. Validate representative tool results and published schemas, with negative fixtures for malformed data and unexpected private fields. Keep the existing list revision and owner-isolation checks.

Contract verification must reject unexpected private fields with strict schemas; silently stripping them is not proof that the serializer respects the boundary.

### 5. Apply patterns only where they remove a concrete problem

| Pattern | Where it helps | What to avoid |
| --- | --- | --- |
| Adapter / anti-corruption boundary | convert provider HTML into the existing `Product` shape once | parser details leaking into planner and MCP handlers |
| Functional core, imperative shell | release parsing and policy evaluation tested without Git/provider writes | new command bus or release service class |
| Explicit DTO / schema boundary | list outputs separate public contracts from persisted ownership fields | cross-domain schema inheritance |
| Existing command lifecycle | characterize proposal state transitions and readback when adjacent code changes | a state-machine library for already explicit control flow |

TSDoc belongs at these contracts: accepted units and bounds, omission behavior, public/private fields, parser side effects, and request-cost invariants. No comment quota or comments that restate variable names.

## Risks / Trade-offs

- Parser CPU/package growth → bound inputs, compile once, measure actual emitted artifacts and cold/warm timings before adoption. No new service, fetch, retry, worker, storage, or capacity.
- Parser defaults can alter text → fixture-driven intentional normalization; never alter price, identity, availability, ranking thresholds or consent semantics.
- CLI parser defaults differ → characterize valid calls and map negated flags explicitly; reject invalid inputs before release operations.
- Stricter schemas reveal existing contract drift → preserve valid outputs and test serialization; never mask failures with a new `any` fallback.
- Coverage instrumentation increases CI duration → report wall-clock delta, reuse runs where supported, avoid unmeasured thresholds.
- Cleanup overlaps active work → coordinate at apply time, refresh main and inspect worktree ownership before each slice. Keep changes to active proposals separate.

## Existing work and conflict handling

`p0-add-self-service-nemlig-credential-onboarding` owns Auth0/credential linking and principal lifecycle. `fix-nemlig-oauth-reliability` owns reconnect acceptance. `fix-fresh-product-revalidation` owns authoritative apply-time product checks. `automate-nemlig-production-deployment` owns deploy leases and fail-closed rollout. `add-named-recurring-shopping-lists` owns list persistence and pending acceptance.

No opposing requirement has been identified in this proposed scope. Source overlap exists in client/MCP/list code: coordinate and serialize those slices. Do not archive another change from checkbox counts alone. If public list shapes conflict with an existing consumer, stop that slice with an exact compatibility example for human resolution. The older kill-switch worktree remains outside this plan. Invite tiers, credential retention and public-tool retirement still require their own product decisions.

## Migration Plan

Order: baseline/coverage, release CLI cleanup, product-text adapter, list contracts, documentation reconciliation. Each slice gets characterization first, focused tests, review, `pnpm verify`, and an independent commit. Use Sol for coordination, Terra for bounded implementation, Luna for inventory and focused checks. Give agents exclusive scopes; the coordinator owns integration and human checkpoints.

Runtime slices require package/release-policy checks, packed smoke, production readiness and CI on integrated main before the existing approved deployment flow. This planning commit requires only documentation integration and CI; it does not deploy. Roll back an implementation slice by a normal reviewed revert and deploy the verified revision through existing procedures; no data migration is planned. Archive this change only after its applicable runtime acceptance is evidenced.

## Future improvements — separate follow-up epics

### P3 — establish repeatable maintenance measurements

- [ ] Record a credential-free benchmark for normalization/planning and emitted package size; use medians and a recorded environment.
- [ ] Try TypeScript's existing `noUnusedLocals`/`noUnusedParameters` checks first, then evaluate a development-only unused-code tool against explicit CLI, MCP, Worker, package, script and dynamic entry points only if a demonstrated gap remains.
- [ ] Track deliberate `ponytail:` ceilings with owners and upgrade triggers; do not remove safety ceilings as debt cleanup.

### P3 — retire legacy saved-plan duplication after compatibility evidence

- [ ] Inventory consumers of saved-plan tools and the existing migration into named lists.
- [ ] Propose deprecation, export/migration, recovery and compatibility tests; ask for the public-contract removal decision before removal.
- [ ] Delete old persistence/tool code only after the migration and deprecation criteria are met.

### P4 — evaluate smarter matching from real missed choices

- [ ] Collect privacy-safe examples of ambiguous or missed grocery choices, including descriptions and comparable package units.
- [ ] Compare current rules with a minimal alternative on that fixed corpus; report false confident choices separately from unresolved ones.
- [ ] Propose any ranking, confidence, product-detail-fetch or automatic authorization behavior change separately, with a provider-call/cost envelope.

## Sources

- [Commander documentation](https://github.com/tj/commander.js): option parsing, negated flags, and error/exit overrides.
- [html-to-text documentation](https://github.com/html-to-text/node-html-to-text/blob/master/packages/html-to-text/README.md): compilation, decoding, selectors, input/depth limits and Node support.
- npm registry read-only metadata checks on 2026-09-08: `npm view html-to-text version engines license dependencies dist.unpackedSize --json` and `npm view commander version engines license --json`.
- Existing evidence: `openspec/changes/archive/2026-09-06-p2-maintain-nemlig-assistant/evidence.md`; live source navigation through jCodeMunch. No token-saving estimate is asserted.
