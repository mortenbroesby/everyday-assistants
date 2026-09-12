## 1. Confirm the implementation boundary

- [x] 1.1 Reconfirm branch, base commit, clean baseline, sibling-owned exclusions, and applicable Definition of Ready entries; record evidence in the change notes or pull request.
- [x] 1.2 Re-run `rg` and build-entry checks for `principal-scope.ts`; verify there are no references outside its own declaration before deleting it.

## 2. Remove proven dead code

- [x] 2.1 Delete `principal-scope.ts` with no replacement; run `pnpm --filter nemlig-assistant check` and verify the package still type-checks.

## 3. Consolidate production-acceptance deadlines

- [x] 3.1 Confirm the focused acceptance tests cover both duplicated operations, total-deadline exhaustion, hanging calls, and distinct error context; add only the smallest missing characterization case and verify it passes before production edits.
- [x] 3.2 Replace the duplicated total-deadline closures with one file-local parameterized helper; run the focused production-acceptance and policy tests and verify the operation order, total deadline, and error messages are unchanged.

## 4. Consolidate Cloudflare admin execution

- [x] 4.1 Convert or extend the focused admin-control tests into equivalent cases for usage and breaker reset, covering success, wrong method, missing dependency, timeout, and backend error; verify the characterization suite passes before production edits.
- [x] 4.2 Replace only the duplicated bounded backend-execution tail with one file-local helper; run the focused gateway tests and verify Tier-0 authorization, method/dependency checks, deadline mapping, aggregate response, and terminal-event behavior are unchanged.

## 5. Consolidate the basket-write primitive

- [x] 5.1 Confirm focused client tests prove one write plus readback for add/remove, zero writes for absent removal, quantity zero for removal, and failure when the exact product remains; add one narrow call-order assertion only if current coverage cannot prove the invariant.
- [x] 5.2 Replace the duplicated `AddToBasket` request construction with one private non-retrying client method; run the focused client tests and verify add, exact-line removal, and clear-basket semantics remain unchanged.

## 6. Review and integration verification

- [x] 6.1 Review the complete diff with the Ponytail, code-simplification, and functional-refactoring criteria; verify production code is smaller overall, no dependency or pattern was added, and skipped areas remain untouched.
- [x] 6.2 Refresh the jCodeMunch index for changed and deleted files, trace affected callers, and verify no stale reference or external contract was introduced; record whether token savings were measurable.
- [x] 6.3 Run `openspec validate simplify-nemlig-runtime-boundaries --strict`, package-focused checks, privacy checks, and `pnpm verify`; verify all applicable Definition of Done gates pass and record any inapplicable criteria.
- [x] 6.4 Coordinate with the sibling session, refresh onto settled `origin/main`, resolve the package version decision under the repository release policy without overwriting sibling-owned manifest/lockfile work, and rerun affected gates.
- [ ] 6.5 Commit and push `codex/heavy-refactor`, open one pull request, wait for required exact-head CI, and verify the remote branch matches the reviewed commit.
- [ ] 6.6 Squash-merge through the protected pull-request ruleset and verify the merge commit and exact-main CI; record that production deployment and external acceptance are inapplicable unless the release policy or final diff makes them required.
- [ ] 6.7 Sync or archive the completed OpenSpec change as required by the repository workflow and verify `openspec list` no longer reports unfinished implementation tasks for this change.
