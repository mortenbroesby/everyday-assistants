## 1. Migrate the Package Build and Toolchain

- [x] 1.1 Align root, Nemlig package, and CI Node metadata with the existing Node 22.23.1 pin; add current compatible `tsdown`, `tsx`, TypeScript 5.9, Node 22 types, and release dependencies; regenerate the frozen lockfile and verify `pnpm install --frozen-lockfile` succeeds without peer or engine warnings.
- [x] 1.2 Add the minimal app-local tsdown configuration for CLI and MCP runtime entries, keep `tsc --noEmit` as the independent check, move tests to source execution, and verify focused lint, build, check, 26-test, and credential-free smoke commands pass.
- [x] 1.3 Rename the private workspace package to `nemlig-shopper`, declare `0.1.0-alpha.0`, exact distributable files, and all three bins while retaining `private: true`; add a temporary-install tarball smoke and verify the packed manifest/file list plus installed CLI/MCP surfaces contain no tests, credentials, local artifacts, unrelated apps, Python, recipe, or checkout capability.

## 2. Adapt Astrograph's Version and Release Policy

- [x] 2.1 Implement the strict `major.minor.patch-alpha.increment` parser, forward-bump assessment, package-scoped path classification, and conventional-commit release kinds; verify table-driven tests cover docs/unrelated no-ops, internal increments, patch/minor/major decisions, shared-lockfile scoping, legacy `0.1.0` bootstrap, and monotonic alpha behavior.
- [x] 2.2 Implement main/tag/npm transaction checks with explicit unpublished-package state and fail-closed registry errors; verify tests accept only newer or first-publish candidates, treat an exact existing tag as idempotent, and reject malformed, stale, duplicate, newer-npm, unavailable-main, and unavailable-registry states.
- [x] 2.3 Add package-filtered read-only plan, explicit apply, and pull-request version-check commands; verify plan leaves Git/files unchanged, apply updates only the Nemlig manifest when valid, and the version gate ignores other-app/docs/spec/workflow-only diffs while rejecting an unbumped Nemlig runtime diff.

## 3. Add Guarded, Disabled CI Publication Scaffolding

- [x] 3.1 Extend the existing CI job to run the package-scoped version policy on pull requests and `main`, preserve the single full verification gate and concurrency/caching behavior, and verify the workflow parses plus exact-head draft-PR run `33307058590` succeeds at `31e701e`.
- [x] 3.2 Retain one dormant post-verification `main` release job behind `NEMLIG_PUBLISH_ENABLED == 'true'`, with job-scoped write/OIDC permissions and exact-candidate output; keep the variable absent and the package private, and verify local release planning covers publish/no-op decisions without changing refs or contacting Nemlig.
- [x] 3.3 Retain a dormant manual retry path behind the same disabled variable that accepts only an existing matching `nemlig-shopper-v<version>` tag and performs no bump/tag creation; verify invalid, missing, mismatched, and already-published retry candidates fail before npm publication.
- [x] 3.4 Document local plan/apply, version semantics, the private package guard, disabled publication state, and the separate future approval/configuration change; verify the docs contain no npm token setup and do not weaken Nemlig credential or basket-mutation rules.

## 4. Verify and Deliver

- [x] 4.1 Run focused Nemlig build/check/lint/tests/smoke/tarball checks, release-policy tests, strict validation for both active OpenSpec changes, and root `pnpm verify`; resolve every failure without live Nemlig credentials, network calls, or basket mutation.
- [x] 4.2 Review the final package tarball and scoped Git diff for secrets, local artifacts, unrelated app publication, workflow overreach, and version/tag mismatch; commit the completed scoped work, push `codex/nemlig-assistant`, verify remote SHA `500f19a4c241038f858babd0994b8399144210f5`, and verify exact-head PR CI run `33308370754` succeeds with both publication jobs skipped.
- [x] 4.3 Record the user's explicit decision to merge the private local CLI/MCP delivery without external publication; verify `NEMLIG_PUBLISH_ENABLED` remains absent, the package remains private, no GitHub `npm` environment or npm trusted publisher/package claim is configured, and document all activation work as deferred rather than completed.
