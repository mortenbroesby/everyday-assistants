## Context

See `proposal.md` for motivation. Two independent read-only audits traced callers and tests from current `origin/main`. They found one unreferenced module and three duplicated runtime paths with existing characterization coverage. They also found that the large MCP, onboarding, HTTP identity, and policy-loading functions encode distinct schemas or safety ordering rather than removable duplication.

The implementation must avoid paths owned by the concurrent Effect/product-fetch work, especially `plans.ts`, `plans.test.ts`, `package.json`, `pnpm-lock.yaml`, picker comparison artifacts, dependency documentation, and the sibling OpenSpec changes.

## Goals / Non-Goals

**Goals:**

- Reduce total production code and the number of places where identical operational behavior is maintained.
- Keep every refactor local to the existing private boundary that already owns the duplicated behavior.
- Make behavioral invariants explicit in focused tests before or alongside each consolidation.
- Keep each slice independently reviewable and revertible within one cleanup pull request.

**Non-Goals:**

- Creating a reusable abstraction outside the file that owns the duplication.
- Converting the codebase to a new functional-programming library or object-oriented pattern.
- Reshaping nearby code solely for stylistic consistency.
- Combining semantically distinct safety paths merely because their syntax looks similar.

## Decisions

### 1. Delete only the proven-dead principal-scope module

Delete `principal-scope.ts` only after repeating reference and build-entry checks on the implementation head. No replacement is needed because the function has no callers.

Alternative considered: retain it for a possible future caller. Rejected because its current absence from all runtime and build paths is direct evidence that it does not need to exist; future work can add the then-required behavior.

### 2. Parameterize only the duplicated production-acceptance deadline operation

Introduce one file-local helper that runs an operation within the existing shared total-deadline calculation and accepts the operation-specific error context. Both current call sites retain their sequence and arguments.

Alternative considered: introduce a general acceptance-step pipeline. Rejected because only two closures are duplicated and the surrounding steps have different semantics.

### 3. Share execution, not policy, for Cloudflare admin controls

Introduce one file-local `runAdminControl` helper for the repeated bounded backend execution, aggregation, terminal event, and error mapping. Route matching, HTTP method validation, dependency availability, and Tier-0 authorization remain explicit at their current call sites and execute before the helper.

Alternative considered: define admin controls as a data-driven route registry. Rejected because it would combine policy and dependency decisions that are currently easy to audit, while only the execution tail is duplicated.

### 4. Share only the provider basket-write primitive

Introduce one private client method that submits the existing `AddToBasket` endpoint payload for a supplied product, quantity, and operation label. `addToCart` and `removeFromCart` retain their separate validation and readback semantics. The helper performs no retry, no pre-read, no post-read, and no clear-basket behavior.

Alternative considered: consolidate complete add, remove, and clear workflows. Rejected because their safety contracts differ: removal must prove the exact line disappeared, absent removal must not write, and clear-basket has separate semantics.

### 5. Preserve native TypeScript and the existing test architecture

Use file-local functions or private methods and existing language features. No dependency, interface, factory, registry, or GoF pattern is justified. Existing tests are the characterization baseline; add only missing table cases or call-order assertions needed to prove the invariant being refactored.

Alternative considered: use the cleanup as a functional-programming dependency foothold. Rejected because these helpers do not require resource management, typed effect composition, or reusable functional utilities, and the sibling work owns that adoption decision.

### 6. Skip refactors that do not reduce maintenance burden

Do not extract a per-product normalization mapper solely to name an existing block. Do not data-drive MCP registrations: `registerAction` already captures their real shared behavior, while their schemas, descriptions, and safety metadata remain intentionally distinct.

## Risks / Trade-offs

- [A shared helper accidentally changes ordering or an error string] → Characterize both call sites and compare exact responses, operation context, timeout mapping, and call order before and after the refactor.
- [Basket consolidation broadens a mutation or introduces retry] → Keep the helper private and limited to one provider request; assert absent removal performs zero writes and add/remove perform one write followed by their existing readback.
- [Admin consolidation moves authorization behind backend work] → Leave authorization, method, and dependency gates at the call sites and out of the helper.
- [Deadline consolidation creates a fresh deadline per step] → Pass the existing total-deadline state into the helper and retain hanging-operation coverage.
- [Concurrent Effect work overlaps during integration] → Do not edit sibling-owned paths; refresh from merged `origin/main` and rerun all gates before the cleanup PR is finalized.
- [A broad cleanup accumulates speculative changes] → Limit implementation to the four audited slices. New findings require separate evidence and a planning update.

## Migration Plan

1. Reconfirm the worktree is based on settled `origin/main`, sibling exclusions remain current, and the baseline verification is green.
2. Implement and verify each slice independently, using small checkpoint commits if useful for review.
3. Run package-focused tests and checks, strict OpenSpec validation, then `pnpm verify`.
4. Reconcile with the sibling's merged work without absorbing its manifest, lockfile, picker, planning, or documentation changes.
5. Push `codex/heavy-refactor`, open one pull request, wait for required exact-head CI, and squash-merge through the protected ruleset.
6. Verify exact-main CI. No production deployment or data migration is required because behavior, packaging, and configuration are unchanged.

Rollback is a normal revert of the squash commit; there is no persistent-state migration.
