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

Use existing modules and plain functions as seams. Keep public tool names, valid CLI invocations, stored data, ownership, request budgets, mutation authorization, and price revalidation stable. Only the explicit MCP additions in this proposal change product behavior/contracts. Malformed release arguments must fail before actions; document any newly rejected malformed form. Verification policy enforcement implements existing requirements, not a new release policy.

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

Adoption gate: use synthetic fixtures, inspect exact-version exports/types/transitive dependencies and advisories, measure installed and packaged byte delta, cold import and repeated conversion time against the same fixtures, and prove no requests or logging are added. Record measurements without calling a parser faster than a regex. If packaging or material operating cost fails this gate, revise this slice before installing into production scope. The requirement is implementation-independent: a failed package gate does not waive it or complete the story. Evaluate the minimal alternative against the same fixtures or explicitly revise the requirement; do not archive with unmet text behavior.

Alternatives: `entities` fixes entity decoding but leaves the broken HTML regex; a DOM emulator adds browser machinery; direct `htmlparser2` requires maintaining text formatting/traversal rules. A small configured converter is the clearest initial choice. Keep the existing seven-line `mapLimit` for now: swapping it for a concurrency package saves little and risks changing rejection/request scheduling.

### 3. Make verification claims executable

Use the existing Node test runner's coverage capability through the installed TS execution path. Confirm source-file attribution and exclusions for tests/generated outputs on pinned Node, then capture a baseline. Do not invent a coverage percentage from test counts or add a test framework. Keep `test` useful on its own; measure whether running test plus coverage repeats the entire suite before altering root verification. The full gate must still execute every required suite once or report explicit reuse, and must fail if expected coverage output is missing.

Artifact contract: ignored app `coverage/coverage.txt` contains the native coverage summary and eligible production-source entries, and CI uploads that report. Missing/empty output, absent summary or zero attributable production files fails the coverage gate even if tests passed. Verify source-map attribution before trusting percentages; no arbitrary minimum percentage is introduced. The smallest script/check around the existing runner is sufficient.

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

No opposing requirement has been identified within the ready P2 scope. The broader audit did identify a P0 implementation/spec mismatch and unresolved lifecycle choices, recorded below; these must not be hidden inside cleanup. Source overlap exists in client/MCP/list code: coordinate and serialize those slices. Do not archive another change from checkbox counts alone. If public shapes conflict with an existing consumer, stop that slice with an exact compatibility example for human resolution. The older kill-switch worktree remains outside this plan. Invite tiers, credential retention and public-tool retirement still require their own product decisions.

## Migration Plan

Order: baseline/coverage, transport composition, release CLI cleanup, product-text adapter, public contracts, planning/persistence separation, presentation boundary, acceptance/release gates, compiler/documentation hygiene, delivery. Each slice gets characterization first, focused tests, review, `pnpm verify`, and an independent commit. Use Sol for coordination, Terra for bounded implementation, Luna for inventory and focused checks. Give agents exclusive scopes; the coordinator owns integration and human checkpoints. Do not run multiple edits to MCP/client/tests concurrently. Reassess each next slice against newly integrated main.

Runtime slices require package/release-policy checks, packed smoke, production readiness and CI on integrated main before the existing approved deployment flow. This planning commit requires only documentation integration and CI; it does not deploy. Roll back an implementation slice by a normal reviewed revert and deploy the verified revision through existing procedures; no data migration is planned. Archive this change only after its applicable runtime acceptance is evidenced.


## Sources

- [Commander documentation](https://github.com/tj/commander.js): option parsing, negated flags, and error/exit overrides.
- [html-to-text documentation](https://github.com/html-to-text/node-html-to-text/blob/master/packages/html-to-text/README.md): compilation, decoding, selectors, input/depth limits and Node support.
- npm registry read-only metadata checks on 2026-09-08: `npm view html-to-text version engines license dependencies dist.unpackedSize --json` and `npm view commander version engines license --json`.
- Existing evidence: `openspec/changes/archive/2026-09-06-p2-maintain-nemlig-assistant/evidence.md`; live source navigation through jCodeMunch. No token-saving estimate is asserted.

## Expanded audit — second round, 2026-09-08

Baseline `c4918237043fd900144f97e4ed81e32eb5338501`; changes since the completed maintenance revision are documentation-only. Audited client, planning/proposals, CLI/MCP/HTTP, principal/credential storage, onboarding/Worker, release/acceptance and CI/test configuration. This is a targeted maintenance audit, not an exhaustive security certification. Indexed navigation was followed by exact source inspection when duplicate local/git index identities blocked refresh; no shared index was invalidated.

| Evidence | Consequence | Smallest proposed treatment / proof |
| --- | --- | --- |
| `src/mcp.ts:16` imports login helper, singleton, version and `ShoppingClient` from `cli.ts`; `http.ts` imports its type there too | Server composition depends on a command entry point and its imports | Move shared contract near client; move only shared composition/version responsibilities out of CLI; import-smoke CLI, stdio and HTTP independently |
| `src/plans.ts:134-186` resolves provider data and computes output; `:187-239` owns filesystem/HTTP snapshots | Pure selection tests share a module with persistence concerns | Characterize selection, quantities and totals; separate calculation from I/O using functions and existing adapters, not a storage framework |
| `src/mcp.ts:229-231` accepts arbitrary plan lines/summary in addition to list `z.any()` sites | Published contracts cannot catch real shape drift | Installed Zod schemas for public plan DTOs; strict result fixtures and representative MCP consumer checks |
| Proposal schema fields combine `applicable` boolean with many optional fields | Impossible combinations can fit a schema | Characterize actual variants and improve internal typing; published-schema tightening is a separate follow-up |
| `src/mcp.ts:884` embeds picker HTML alongside tool registration; icon is a very large constant | Presentation edits and orchestration are reviewed together | Move existing static presentation into a minimal module/asset only with exact-byte/URI/package smoke proof; no UI rebuild |
| `scripts/production-acceptance.ts:40-77` performs network work at module import | Command routing/env validation cannot be imported safely for focused tests | Explicit `main` and direct-entry guard, fake clients/fetch, preserved edge/read-only/mutation distinctions |
| `.github/workflows/ci.yml` calls readiness but not `check:version-bump` | Existing package-distribution version policy lacks CI enforcement | Wire existing checker with deliberate PR/push base/head semantics and offline fixtures, no new release engine |
| Native TypeScript unused checks report `cloudflare-worker.ts:347` unused `config` | A simple compiler capability is unused | Inspect callable signature, remove binding only if safe, enable existing compiler checks; no deletion package needed |
| `docs/nemlig-production-readiness.md:57-64` records old revision evidence and mentions coverage tasks | Readers can confuse historical acceptance with current evidence | Label history and distinguish current source/package/production proof; leave pending acceptance explicit |

Dependency inventory found direct import/configuration use for all six runtime and eleven development dependencies. No dependency deletion is justified by this audit. A Node coverage experiment ran 179 tests, but headline percentages are not adopted as the baseline until production-source attribution and exclusions are verified. No measured performance improvement is claimed.

Expanded-plan verification: strict validation passed all 14 items, privacy checks passed, and `pnpm verify` succeeded using Turbo's existing runtime cache (including the 179-test result). Coverage still reports zero tasks; this planning revision does not fix it. Only five documentation/spec files changed; no runtime code, dependencies, provider configuration or production state changed.

### Target responsibility boundaries

```text
CLI / MCP / HTTP composition
  -> shared client contract + explicit credential source (no prompt in server)
  -> planning/proposal functions (selection, quantities, lifecycle)
  -> existing provider client / existing snapshot and named-list adapters
MCP public schemas + serializers -> structured results / existing picker
Release and acceptance entry points -> pure policy/dispatch -> explicit effects
```

These are responsibilities, not a mandate for a file per box. Preserve compatibility exports where consumers require them. No new interface with a single implementation, class hierarchy, central tool registry or dependency injection container. A split must demonstrably remove an import dependency, isolate a side effect or make a meaningful test possible; otherwise leave the code in place and record why.

### Additional design decisions and invariants

1. **Transport independence:** put the `ShoppingClient` contract with client-domain types, not in a CLI entry point. Reuse the existing injected credential loader and client; do not create a new service layer. Version loading stays package-derived. Local interactive prompting must remain possible in CLI and impossible in server import/request paths. Tests cover invocation as source and packed entry points.
2. **Planning as a functional core:** preserve candidate order/tie breakers, unavailable-line handling, duplicate product aggregation, units, totals, concurrency three and subtraction of current basket quantities. Existing search ranking and plan matching are different policies; do not merge them for visual similarity. Preserve saved-plan keys, TTL/validation, principal scopes and Tier-0 legacy fallback. Any discovered rejection/cancellation change is a separately specified bug fix, not a silent refactor.
3. **Public contracts:** extend the list DTO work to plan lines/summary. Keep text and structured result meanings aligned with typed serializers. Characterize proposal success/not-applicable variants before reducing internal `Record<string, unknown>` casts; published proposal schema tightening is excluded and needs its own requirement if pursued. MCP SDK schema conversion must accept the chosen list/plan form; no breaking output shape or public tool removal to obtain prettier types.
4. **Presentation boundary:** keep exact resource URI, MIME type, CSP/metadata, escaping, image allowlist and user-selection protocol. Move static data only if packaged deployment includes it reliably. Tests cover missing/empty products, malicious product text, selection message and absent optional images. Asset extraction is not authorization to change UI behavior or fetch remote assets.
5. **Verification shell:** importing acceptance must have zero fetch/process-exit side effects. Parse and validate before executing requested operations while keeping the explicitly credential-free edge mode. Mutation acceptance still requires the exact approved envelope/restoration and must never become a default. Existing timeout promises do not necessarily cancel underlying work; cancellation is a separately investigated follow-up.
6. **Release gate:** use existing version-bump checker. Specify PR merge-base and push comparison explicitly, including initial/missing base and docs-only revisions; fail clearly when a required comparison cannot be resolved. No generic `HEAD~1` assumption for multi-commit pushes. Unit fixtures must not push, tag or deploy.
7. **Maintenance measurement:** record production/test line delta, files/dependencies added or removed, packed bytes, cold startup and test/check elapsed time per applicable slice. Numbers explain trade-offs, not quotas. Preserve bounds even when removing them would make a benchmark faster. TSDoc explains units, ownership, freshness, non-retry mutations, storage compatibility and pure/effectful boundaries.

### npm decision matrix

| Option | Real wheel or issue | Decision |
| --- | --- | --- |
| Installed `commander` | Release-agent custom flag parser | Adopt reuse, with exact negation/error tests |
| Installed `zod` | Arbitrary public list/plan result shapes | Reuse concrete schemas; no schema framework |
| `html-to-text` 10.0.1 | Regex attempts HTML parsing/decoding | Recommended new runtime module, subject to bounded-fixture/package/CPU gate above |
| `tough-cookie` 6.0.2 | `client.ts:584-594` manually splits cookies into a host map, without path/expiry/deletion semantics | Evaluate in a separate auth reliability change; do not install in P2 |
| Node coverage and TS unused checks | No-op coverage wiring and unused binding | Native tooling first; no test/dead-code dependency now |
| `@tanstack/pacer`, `lru-cache`, `ky`, Orval | Cross-run scheduling, discovery freshness/deduplication and API contract maintenance | Approved investigation directions; adoption needs the specific behavior and cost gates below, not a blanket rejection or installation |

### Module-first implementation decision — 2026-09-08

The user approved applying the evening's refactoring programme with dedicated Terra/Luna implementation and Astra/Sol planning. Start independent Commander and coverage slices, then the already-specified HTML adapter. Preserve the rest of the ten-story plan; these investigation directions do not silently replace ready work.

- **Pacer/cache clarification:** current published `@tanstack/pacer@0.22.0` exports debounce/throttle/queue/rate/batch/retry facilities, not an LRU or AsyncCache. Official reference and published package inspection agree. It cannot replace product caching. Existing `knownProducts` refreshes eviction order on writes, not reads: it is bounded write-recency eviction, not access-LRU. `getFreshProduct` bypasses it. [Pacer reference](https://tanstack.com/pacer/latest/docs/reference).
- **HTML handoff:** Terra owns `client.ts` normalization and its tests, after the coordinator hands off manifest ownership. First demonstrate regex failures on entities/quoted delimiters/non-content HTML; use compiled conversion with the exact raw/depth/node/output bounds above. Measure cold import separately and per-field median/p95 for 1,000 bounded synthetic conversions plus a 41-field worst-product fixture. Record package closure/advisories/emitted bytes and check for warnings. No price/availability/cache/ranking changes.
- **LRU investigation:** characterize repeated reads, write eviction, >1,000 entries, TTL expiry and simultaneous misses with synthetic data. A future TTL/cache key policy must include principal/session/delivery context and fresh-read bypass. Do not share authenticated caches across users or introduce background refresh. Compare requests and memory before approving adoption.
- **Pacer investigation:** reproduce overlapping per-run search concurrency; compare a bounded shared discovery scheduler with the current per-run loop. Specify queue rejection/result routing, fairness, cancellation and retry ownership. Pacer's pending queue size does not bound active work, and it does not replace Durable Object quotas. Disable nested retries; do not schedule basket mutations or assume batching is an upstream bulk API.
- **API/IO investigation:** distinguish absent optional descriptions from unknown availability or malformed basket data. These need explicit response semantics and regression fixtures before changing normalization. Evaluate existing Zod first, and Ky against exact headers/cookies/errors/abort/retry behavior. A generic HTTP client's defaults cannot expand retries. Orval remains conditional on a trustworthy OpenAPI document; six documentation URL checks in the preceding exploration did not find one. An observed local contract must be labelled as such, not authoritative provider documentation.

These followups retain bounded traffic and no new services as the starting cost model. TTL refetches, retry stacking, queues prolonging Container activity and logging are credible cost drivers; measure them and obtain direction before material increases. No new cache/scheduler/HTTP runtime dependency is approved merely by this investigation brief.

Read-only registry metadata on 2026-09-08: `tough-cookie` 6.0.2, BSD-3-Clause, Node >=16, direct dependency `tldts ^7.0.5`. Its [official CookieJar documentation](https://github.com/salesforce/tough-cookie) supports URL-scoped parsing/retrieval with an in-memory store. Adoption requires synthetic host/domain/path/expiry/deletion/Secure fixtures, explicit allowed origins, package/advisory checks and no persistent cookie serialization/logging. It may improve correctness rather than speed; changing cookie behavior requires the authentication owner's review. Keep custom request retry logic: a generic retry package could dangerously retry basket mutations.

## Prioritized follow-up epics and human flags

These checklists are **not part of applying this P2 change**. Transfer confirmed work to its owning change before implementation; do not duplicate active specs. Priority is a planning judgment, not a claim of a reproduced production incident.

### P0 — reconcile existing invitation and principal lifecycle work

- [ ] Reconcile active self-service design (fixed connect URL, exact-email invitation records, no paid Organizations dependency) with `onboarding.ts:47-76,176-204` and Worker organization checks. Current code forwards Organization invitations; this is incomplete implementation against that spec, not evidence of two approved opposing specs. **Human checkpoint:** confirm intended invitation model/any provider-cost implications before setup changes; keep the P0 owner responsible.
- [ ] Decide whether accepted-principal capacity is lifetime or active: `principal-records.ts:59-115` increments for new subjects but revoke does not decrement. Test 15 distinct invite/revoke cycles and concurrent registration against the chosen invariant. **Human checkpoint:** retention/erasure policy before reclaiming slots.
- [ ] Define revoke/reinvite and owner-key rotation data continuity: plans/lists are scoped by opaque principal key, and re-registration makes a new key. **Human checkpoint:** choose retain-inaccessible, recoverable continuity, or explicit purge/export; no cleanup migration or silent deletion.

### P1 — prove lifecycle and request-failure behavior

- [ ] Under the P0 owner, add barrier-controlled concurrent credential-rotation tests. Transactional generation mismatch appears to preserve one stored winner but returns generic failure to the other; specify a sanitized conflict result without retry before implementation.
- [ ] Under OAuth/P0 ownership, prove stale transport closes and map entries are removed on invalidation. Current HTTP mismatch rejects but does not close the obsolete transport; preserve auth-before-wake, principal isolation and zero extra provider calls.
- [ ] Reproduce early basket rejection while plan discovery is pending (`plans.ts:134-186`) in an isolated test process. It starts the basket promise before awaiting searches; an unhandled rejection is a hypothesis until the test proves it. If reproduced, attach rejection handling immediately without changing concurrency, fallback or retry policy.
- [ ] Trace acceptance deadlines end-to-end and test a never-resolving fake request; determine which transports support real cancellation. Do not claim `Promise.race` stops underlying I/O or add automatic mutation retries.
- [ ] Characterize provider cookie expiry/deletion and URL scope; evaluate `tough-cookie` only if fixtures prove the current jar fails a needed contract. Coordinate with fresh-revalidation and OAuth work.

### P3 — measurable performance and compatibility-led deletion

- [ ] Build a small synthetic normalization/planning corpus, record medians, request counts, peak memory and packed bytes; set regression budgets only after a repeatable baseline.
- [ ] Inventory saved-plan consumers, legacy storage and named-list migration; propose deprecation/export/recovery acceptance before requesting public tool removal.
- [ ] Evaluate unused-export tooling only if native checks miss a demonstrated issue; configure actual CLI/MCP/Worker/dynamic/package entry points and manually prove a candidate before deleting it.

### P4 — product matching improvement, not cleanup

- [ ] Capture privacy-safe missed/ambiguous choices and description/attribute evidence; compare false confident selections separately from unresolved results.
- [ ] Evaluate description-aware matching against that corpus with explicit request/CPU budgets, then propose behavior and confidence presentation separately. Do not alter automatic basket consent or fetch volume inside maintenance.

The ready P2 slices do not depend on resolving these human flags. If an apply slice touches their shared code, coordinate ownership and stop only the conflicting slice. This keeps maintenance actionable while exposing the more important product/security work instead of burying it.
