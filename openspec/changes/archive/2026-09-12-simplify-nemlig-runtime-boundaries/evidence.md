# Implementation evidence

## Ready baseline

- Branch/worktree: `codex/heavy-refactor` in its dedicated linked worktree.
- Base: `0282105555ba885d68b38ce42e2fef687f7a12bf`, equal to `origin/main` when implementation started.
- Runtime: Node `v22.23.1`; pnpm `9.15.9`.
- Bootstrap: frozen installation completed after forcing pnpm to materialize the missing worktree `node_modules` links; no manifest or lockfile changed.
- Baseline: `pnpm verify` passed before implementation (324 tests and 5 package-smoke checks).
- Ownership: the sibling Effect session confirmed the four runtime files in this change remain exclusive to `codex/heavy-refactor`; its planning, picker comparison, dependency documentation, manifest, lockfile, and OpenSpec paths remain excluded here.
- Authority: repository refactoring, tests, commits, pull-request integration, and release-policy handling are authorized. No basket action, live provider check, secret operation, Cloudflare mutation, or deployment is authorized or required by this refactor.
- Cost/safety: no dependency, service, retry, request, storage, logging, capacity, or provider-frequency change is planned. Existing auth, quotas, deadlines, circuit breaker, kill switch, and single-attempt mutation behavior are invariants.
- Reproducer: existing focused tests characterize each duplicated behavior; `rg`, jCodeMunch reference tracing, and build entries show `principal-scope.ts` has no runtime caller or entrypoint.

## Implementation head checks

- `principalScopeFor`: zero jCodeMunch references and zero importers.
- Filesystem search: only the declaration and planning/history prose mention `principalScopeFor` or `principal-scope`; active package entrypoints are `cli.ts`, `mcp.ts`, and `http.ts`.

## Basket-write consolidation

- Existing `client.test.ts` coverage proves add write then readback, remove pre-read then zero-quantity write then readback, zero writes for absent removal, rejection when the exact product remains, and the separate clear-basket contract; no new test was necessary.
- `pnpm --filter nemlig-assistant exec tsx --test src/client.test.ts`: 32/32 passed before and after the refactor.
- `pnpm --filter nemlig-assistant check`: passed.
- Production diff: 19 additions, 28 deletions (net -9 lines); the new private helper performs exactly one existing `json(..., false)` request.

## Admin-control consolidation

- Added one two-route characterization matrix covering success, wrong method, missing dependency, bounded timeout, backend error, response status, and exactly one terminal outcome for each case.
- Route selection, Tier-0 authentication, method checks, and dependency checks remain outside and before the shared execution helper.
- `pnpm --filter nemlig-assistant exec tsx --test src/cloudflare-gateway.test.ts`: 17/17 passed.
- `pnpm --filter nemlig-assistant check`: passed.

## Dead code and acceptance deadlines

- Deleted the seven-line `principal-scope.ts` module after the zero-reference and zero-importer checks above; package type-check passed.
- Replaced two duplicated total-deadline closures with one file-local helper parameterized by the existing deadline and operation-specific context.
- Added the missing service-acceptance timeout-context characterization; focused acceptance checks passed 11 and 15 tests, and policy checks passed 4 tests during the slice.
- A broader combined run intermittently cancelled the pre-existing unrelated edge-probe timeout test; an immediate exact-name rerun passed 1/1 in 49 ms. Final repository verification remains required.

## Simplification and reference review

- Ponytail diff review found two call-site reductions and they were applied: bind production-acceptance deadline context once per verifier, and keep the admin runner inside the gateway scope so it captures existing request state instead of receiving five plumbing arguments.
- Final production-source delta before release metadata: 66 additions and 91 deletions (net -25 lines). Test additions characterize shared failure behavior; no dependency, pattern, interface, factory, registry, or generic pipeline was added.
- Only the four audited production paths, two focused tests, and this OpenSpec change are modified; all sibling-owned paths remain untouched.
- jCodeMunch incremental refresh reported 3 changed, 1 new, and 1 deleted indexed files. Text search confirms each new private helper has exactly two intended call sites and `principalScopeFor` is absent; importer tracing found no deleted-file importer and preserved the existing public module import graph.
- jCodeMunch did not report a token-savings measurement, so none is claimed.

## Release sequencing

- The sibling Effect session confirmed no uncommitted manifest or lockfile edits and agreed that this cleanup releases first; it will preserve the non-retrying mutation helper and rebase after this merge.
- A fresh fetch confirmed `origin/main` remained `0282105555ba885d68b38ce42e2fef687f7a12bf`, equal to this branch base before the version decision.
- The repository release planner classified the four production-source paths as a patch and selected unpublished `4.6.1-alpha.70`; the generated manifest bump and matching release note are included. `pnpm-lock.yaml` did not require a change.

## Final local verification

- `openspec validate simplify-nemlig-runtime-boundaries --strict`: passed.
- `pnpm privacy:check`: 3 tests passed and 384 public-tree files passed inspection after removing the machine-specific worktree path from this note.
- `pnpm --filter nemlig-assistant test`: 329/329 passed after the stalled-fetch test fixture retained a realistic open connection until its abort signal fired.
- `pnpm verify`: passed on the versioned final candidate; lint, build, both TypeScript configurations, coverage (326 tests; 94.38% lines, 85.33% branches, 92.22% functions), and smoke (5/5) all passed.
- No live provider, owner-token, basket, account, secret, or Cloudflare mutation check was run. The credential-free production-readiness dry run is recorded separately when complete.
- `pnpm nemlig:production:ready`: passed. It validated all 21 OpenSpec items, the public tree, the repository gate, packed-package interfaces, and a Cloudflare production dry run with the existing one-container limits and disabled defaults. It did not deploy or use production credentials.

## Integration and release evidence

- Commit `c4d4ead423eb61fba4801ad94a68df104237994b` was pushed to `codex/heavy-refactor`; the remote ref matched the reviewed commit.
- Pull request #41 passed exact-head CI run `34713104495` and was squash-merged through the protected ruleset.
- The merged `main` commit is `e29dd8dc7a7da74fc3460cf3f0c20067287c8fb2`; exact-main CI run `34713217912` passed its production-readiness gate.
- The runtime diff required a release. Nemlig production run `34713319361` deployed the exact merged commit and published prerelease `nemlig-assistant-v4.6.1-alpha.70`; the tag resolves to the same commit.
- External live acceptance remained out of scope because this behavior-preserving refactor did not authorize account, basket, or other user-data access.
- The change has no delta specs. It is archived directly after this evidence update, and `openspec list` is checked afterward to confirm it leaves the active queue.
