# Epic P2 — Make the Nemlig assistant easier to change safely

Status: **applying** following user approval on 2026-09-08. Ten stories; evidence is recorded in `evidence.md`. Independent module/parser preparation may overlap coverage under the user's module-first request; integration remains serialized. P0/P1/P3/P4 follow-up epics in `design.md` remain excluded from this change's apply/completion checklist.

Definition of done: maintained parsing and concrete public contracts; independent transport composition and testable planning/acceptance boundaries; real coverage and release checks; preserved safety/storage/wire contracts; measured trade-offs; integrated commits, exact-head CI and applicable read-only runtime acceptance.

Execute one reviewable slice at a time. Sol coordinates/integrates, Terra implements bounded scopes, Luna performs focused checks/inventory. No concurrent edits to shared runtime/test files. A justified no-op needs recorded evidence, not an artificial refactor. Dependencies follow the order below; after story 1, parser/compiler work can be prepared independently, but commits and shared-file edits stay coordinated.

## 1. Story — Trustworthy baseline and coverage

- [x] 1.1 Refresh main in the assigned worktree; record base SHA, clean status, active ownership and scoped files in implementation evidence. Verify no sibling work is absorbed.
- [x] 1.2 Run baseline pnpm verify and record tests, wall time and actual coverage output; distinguish executed tests from instrumented coverage.
- [x] 1.3 Wire Node coverage through the existing TS runner/app script into ignored app `coverage/coverage.txt`; verify production-source attribution and test/generated exclusions. Fail the gate if the report is missing/empty, lacks the native coverage summary, or has no eligible production-source entries; publish it as a CI artifact.
- [x] 1.4 Measure baseline line/branch/function coverage and execution overhead; ensure root verification runs all suites without an unexplained duplicate test pass.
- [x] 1.5 Record existing safety/contract fixtures and gaps, run the full gate, review and commit this baseline slice.

## 2. Story — Decouple server composition from the CLI

- [x] 2.1 Trace all imports of ShoppingClient, ensureLoggedIn, getClient and NEMLIG_VERSION; characterize CLI, stdio and HTTP startup/authentication with fake credentials and no network.
- [x] 2.2 Move shared client types to the existing client-domain boundary and only the necessary shared bootstrap/version logic out of cli.ts; verify MCP/HTTP no longer import the executable CLI module.
- [x] 2.3 Preserve injected credential loading, lazy client construction, version lookup and compatibility exports where required; verify servers never prompt and local CLI login still can.
- [x] 2.4 Add import and packed-entry smoke checks for source/packaged CLI, stdio and HTTP; verify no import starts a server or performs network I/O.
- [x] 2.5 Add boundary TSDoc, record dependency/line/startup deltas, run pnpm verify, review and commit.

## 3. Story — Reuse the installed release argument parser

- [x] 3.1 Characterize parseArgs callers, defaults, valid flags, repeated flags, missing values, unknown flags and --no-release without Git/provider writes.
- [x] 3.2 Replace the manual loop with installed Commander; explicitly map negated release to existing noRelease and use thrown validation errors. Verify malformed inputs cannot initiate apply.
- [x] 3.3 Preserve the pure release policy and explicit side-effect entry point; document parser semantics, run release tests and pnpm verify, record code delta, review and commit.

## 4. Story — Replace invented HTML parsing with bounded readable evidence

- [x] 4.1 Add failing normalization tests for entities, quoted greater-than signs, script/style contents, lists, malformed/empty inputs and Danish characters through actual product normalization.
- [x] 4.2 Evaluate exact-version html-to-text exports/types/license/transitive dependencies/advisories; measure installed/packed-byte delta and cold/warm conversion timings on synthetic fixtures.
- [x] 4.3 After the adoption gate passes, add the scoped dependency and compile once with pre-input/depth/node limits; verify existing description/attribute output ceilings and omission rules.
- [x] 4.4 Trace catalogue/favorites/department/planner consumers; verify shared normalized evidence, escaped picker text, unchanged price/availability/fresh revalidation and provider-call counts.
- [x] 4.5 Run focused tests, pnpm verify and packed smoke; record CPU/package/code trade-offs, update required metadata, review and commit.

## 5. Story — Make public MCP results concrete

- [x] 5.1 Inventory list, plan and proposal serializers/published schemas; record valid wire shapes and protected storage fields, coordinating named-list ownership.
- [x] 5.2 Add positive and negative fixtures for all affected tool result shapes, including private fields, malformed nested values and proposal success/not-applicable variants.
- [x] 5.3 Replace list z.any schemas with strict minimal public Zod schemas; verify unchanged names, fields, list identity/revision and ownership isolation.
- [x] 5.4 Replace plan lines/summary z.any schemas using actual public candidate/summary shapes; verify representative saved-plan/named-list resolution responses remain compatible.
- [x] 5.5 Characterize proposal variants and improve internal serializer typing only where all valid payloads remain identical; do not tighten published proposal schemas in this change. Record a separately scoped follow-up if public variant enforcement is needed.
- [x] 5.6 Verify schema conversion through the installed MCP SDK and text/structured result consistency; run interface/list/planner tests and pnpm verify, review and commit.

## 6. Story — Separate planning calculations from snapshot I/O

- [ ] 6.1 Trace plan callers and snapshot consumers; establish deterministic fixtures for order/ties, explicit selection, missing results, quantities, duplicate products, totals and concurrency limits.
- [ ] 6.2 Isolate pure calculations from discovery/basket loading with plain functions only where it enables meaningful no-I/O tests; preserve separate search and plan ranking policies.
- [ ] 6.3 Demonstrate the concrete filesystem/HTTP import edge removed or no-I/O calculation test enabled before separating snapshot adapters; record a no-op if neither exists. Preserve file permissions, URLs, principal scope, validation, legacy Tier-0 reads and stored bytes.
- [ ] 6.4 Run identical fixtures before/after, including storage adapter contract tests; verify no extra requests, retries, parallel writes or changed unmatched-line behavior.
- [ ] 6.5 Route any reproduced request-rejection/cancellation defect to its separate reliability slice instead of silently fixing it here; record decisions, run pnpm verify, review and commit.

## 7. Story — Make MCP presentation independently maintainable

- [ ] 7.1 Trace picker/resource/icon consumers and packaging; characterize resource URI/MIME/metadata, selection messages, escaping, optional images and empty/error rendering.
- [ ] 7.2 Extract existing static presentation only where it removes an orchestration dependency; retain a single minimal module or packaged asset and record a no-op decision if the split adds no value.
- [ ] 7.3 Verify exact icon bytes and intended HTML behavior in built/packed resources, including hostile product text and absent images; no remote asset fetch or UI framework.
- [ ] 7.4 Keep typed serializers and existing UI protocol; add concise security/packaging TSDoc, run focused tests and pnpm verify, record file/byte delta, review and commit.

## 8. Story — Make acceptance and release policy gates executable

- [ ] 8.1 Trace production-acceptance script invocation and existing version checker; define fake test seams plus explicit CI base/head semantics for PRs and multi-commit main pushes.
- [ ] 8.2 Move acceptance dispatch into an import-safe main with direct-entry guard. Verify importing performs zero network calls, server starts or process exits.
- [ ] 8.3 Test missing credentials, edge-only, default read-only, malformed flags/envelopes and mutation/restoration confirmation with fake clients; verify mutation never becomes a default.
- [ ] 8.4 Include acceptance-entry tests in the app test/coverage scripts and preserve explicit live acceptance commands; do not run credentialed or basket-mutating tests as part of this cleanup.
- [ ] 8.5 Wire the existing version checker into CI with documented comparison inputs and docs-only handling; fixture-test patch/minor/major/no-release and unavailable-base failure without Git/provider writes.
- [ ] 8.6 Run focused release/acceptance tests, pnpm verify and credential-free readiness checks; record policy/command evidence, review and commit.

## 9. Story — Compiler hygiene, contract documentation and backlog truth

- [x] 9.1 Run native noUnusedLocals/noUnusedParameters and inspect each finding/caller; resolve the observed unused Worker binding without changing a callable contract, then enable checks.
- [ ] 9.2 Verify imports/configuration and dynamic/package entry points before declaring anything dead; retain all currently used dependencies unless new evidence proves a removal safe.
- [ ] 9.3 Add TSDoc only for public contracts, units/bounds, freshness, non-retry mutations, owner isolation and pure/effectful boundaries; review against behavior/tests rather than a comment quota.
- [ ] 9.4 Reconcile backlog and readiness claims against current/archive/acceptance evidence; mark historical SHAs explicitly and preserve outstanding owner/production tasks.
- [ ] 9.5 Record deliberate ponytail ceilings and measured changes; run typecheck, pnpm verify and privacy checks, review and commit.

## 10. Story — Integrate, accept and close the epic

- [ ] 10.1 Review each story's evidence and compatibility/request-budget invariants; verify no auth redesign, data migration, unsafe deletion, capacity increase or repeated prior-maintenance work entered the diff.
- [ ] 10.2 Run strict OpenSpec validation, privacy checks, pnpm verify and pnpm nemlig:production:ready; distinguish credential-free checks from outstanding live acceptance.
- [ ] 10.3 Coordinate with siblings, refresh main, integrate scoped commits and verify exact remote SHA plus green exact-head CI before any runtime rollout.
- [ ] 10.4 For runtime changes verify current explicit deployment authority and coordinate before the existing rollout/read-only acceptance procedure; this plan grants no new provider authority. Retain human checkpoints for destructive/external-user-data actions, new costs, secrets, unresolved authority or conflicting scope. Never mutate a basket under cleanup authority.
- [ ] 10.5 Record delivered code/dependency/package/check-time deltas, remaining risks and separate follow-up owners; verify evidence supports each completed checkbox.
- [ ] 10.6 Sync only this change's requirements and archive after applicable acceptance; push the final documentation commit and verify remote main/CI.
