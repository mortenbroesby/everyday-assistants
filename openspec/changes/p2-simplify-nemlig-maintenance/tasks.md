# Implementation plan

Status: proposed, not applied. Five P2 epics, ordered by dependency; P3/P4 follow-ups live in `design.md` and are not part of this change's completion. Each checked task requires the evidence it names. Coordinate and commit each completed slice before starting the next.

## 1. Epic P2 — trustworthy baseline and verification

### Story: know what our checks actually prove

- [ ] 1.1 Refresh main in the assigned isolated worktree and inspect active ownership; record base SHA, clean status, scoped files and overlaps in `evidence.md` before editing.
- [ ] 1.2 Run baseline `pnpm verify`; record test counts, elapsed time and the current coverage task's actual output, distinguishing tests from coverage.
- [ ] 1.3 Wire real coverage through the existing Node/TS test runner and app script; verify the report attributes execution to production TypeScript and excludes tests/generated code.
- [ ] 1.4 Establish a measured coverage baseline and missing-report failure behavior; verify the root gate exercises the intended suites and record repeated-run/CI overhead before consolidating anything.
- [ ] 1.5 Run focused checks and `pnpm verify`, review and commit this slice; record the report location and the limits of what coverage proves.

## 2. Epic P2 — remove invented release-argument parsing

### Story: one maintained CLI convention

- [ ] 2.1 Trace release parser callers and characterize valid flags, defaults, repeated flags, unknown/missing values and `--no-release`; verify tests perform no Git/provider writes.
- [ ] 2.2 Replace the local argument loop with installed Commander using explicit negated-flag mapping and thrown validation errors; verify all valid calls preserve their option values and malformed input cannot trigger apply.
- [ ] 2.3 Document the parser/policy/side-effect boundary with concise TSDoc; run release tests and `pnpm verify`, record line/dependency delta, review and commit.

## 3. Epic P2 — readable, bounded product descriptions

### Story: replace regex HTML parsing with a maintained npm module

- [ ] 3.1 Add failing synthetic characterization cases for entities, quoted delimiters, script/style contents, lists, empty/malformed inputs and Danish characters; prove current failures through product normalization rather than only a copied helper.
- [ ] 3.2 Evaluate exact-version `html-to-text` package exports, types, license, dependency tree and advisories; record Node compatibility, packaged-size delta and cold/warm conversion timings with the same fixtures.
- [ ] 3.3 After the adoption gate passes, add the scoped dependency and compiled converter, retaining raw-input/depth/node caps and existing output/attribute limits; verify normalization cases pass without extra fetches or logs.
- [ ] 3.4 Verify catalogue, favorites, department and planner paths consume the same normalized evidence and picker text stays escaped; assert price, availability, fresh-revalidation and provider request counts are unchanged.
- [ ] 3.5 Run focused client/interface/planner tests, `pnpm verify` and packed-package smoke; record package/CPU/code deltas, update feature documentation and release metadata as required, review and commit.

## 4. Epic P2 — explicit shopping-list response contracts

### Story: public schemas describe the data actually returned

- [ ] 4.1 Trace every list result serializer and caller; record public list/summary shapes and protected stored fields, coordinating with the active named-list change.
- [ ] 4.2 Add contract fixtures for each affected success result plus malformed/private-field cases; verify the permissive baseline's missing protection is demonstrated.
- [ ] 4.3 Replace affected `z.any()` output schemas with minimal installed-Zod public schemas; verify published tool schemas and actual results conform without changing tool names, valid fields, revision or isolation semantics.
- [ ] 4.4 Run interface/list tests, `pnpm verify` and package smoke; review TSDoc and serialization, record compatibility/dependency delta and commit.

## 5. Epic P2 — documentation cleanup and delivery

### Story: backlog status matches evidence

- [ ] 5.1 Reconcile stale automatic-grocery and other backlog claims against main, archive and acceptance evidence; verify every revised status has an evidence pointer and pending owner/production tasks remain pending.
- [ ] 5.2 Explain in the readiness documentation what source smoke, package smoke and measured coverage each prove; verify commands match actual scripts and add no redundant gate.
- [ ] 5.3 Review deliberate simplifications and public-boundary TSDoc; verify no speculative registry, schema factory, unsafe deletion or repeated prior-P2 work entered the diff.

### Story: integrate and prove the result

- [ ] 5.4 Run strict OpenSpec validation, privacy checks, `pnpm verify` and `pnpm nemlig:production:ready`; record actual results and resolve regressions introduced by these slices.
- [ ] 5.5 Reconcile current main and sibling ownership, commit/push scoped work and verify CI succeeds for the integrated revision; record SHA and CI URL.
- [ ] 5.6 For runtime changes, use the approved deployment procedure for that verified revision and record bounded read-only acceptance of text/list behavior; retain separate checkpoints for new cost, credentials or unresolved provider authority and do not mutate a basket.
- [ ] 5.7 Sync only this change's additive requirements, archive after applicable acceptance is complete, and verify the final documentation commit on remote main with successful CI.
