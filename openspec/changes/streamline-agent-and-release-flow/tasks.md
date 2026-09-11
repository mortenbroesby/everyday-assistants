## 1. Make the agent loop bounded

- [x] 1.1 Update `AGENTS.md` so the main thread is Sol, long-running tasks use one quiet decision-input heartbeat, completed tasks disable it, and all integration uses the active PR ruleset; verify the instructions contain no direct-main or deployment-label path.
- [x] 1.2 Update Definition of Ready to require one pinned-toolchain/frozen-install worktree bootstrap, the smallest failing reproducer, and an explicit reality check after two failed iterations without new evidence; verify each requirement has a concrete stop condition.
- [x] 1.3 Update Definition of Done to require focused checks, a representative end-to-end smoke test for behavior changes, and one final `pnpm verify` unless a relevant diff or diagnosed failure requires repetition; verify incomplete integration, CI, or production evidence still cannot be called done.
- [x] 1.4 Update `.husky/pre-push` to run the existing Nemlig version check against the branch merge-base before `pnpm verify`; verify an eligible unversioned fixture branch fails and a documentation-only fixture passes without weakening the full gate.

## 2. Select releases from the existing policy

- [x] 2.1 Add failing focused tests for machine-readable version-policy eligibility and for workflow handling of eligible, ineligible, malformed, stale, and manual candidates; verify all automatic cases stop before credentials or provider access until implemented.
- [x] 2.2 Extend the existing version-check command with the minimum machine-readable eligibility output while preserving its current CLI and CI behavior; verify its existing tests plus the new eligible/ineligible cases pass.
- [x] 2.3 Replace the pull-request label lookup in `.github/workflows/nemlig-production.yml` with an exact checkout and version-policy eligibility check, keeping manual dispatch, exact-head CI, protected environment, concurrency, timeouts, permissions, and recovery unchanged; verify the focused workflow contract test passes.
- [x] 2.4 Update Cloudflare operations documentation to describe automatic release-bearing selection and ineligible skips; verify it still documents the final environment approval, exact SHA, and manual recovery path.

## 3. Verify and integrate once

- [x] 3.1 Run focused version-policy and production-workflow tests, a local eligible/ineligible merge-range smoke test, `openspec validate streamline-agent-and-release-flow --strict`, and one final `pnpm verify`; verify all pass on the unchanged final candidate.
- [x] 3.2 Review the final diff for secrets, unrelated files, new dependencies, retries, capacity, or cost growth; verify the change adds none and leaves other worktrees untouched.
- [ ] 3.3 Commit and push the feature branch, open a pull request, confirm ruleset `Protect main with pull requests` and exact-head `verify` are active, then merge through GitHub and verify remote `main` contains the merge; never push directly to `main`.
- [ ] 3.4 Verify the merged workflow-only change is classified ineligible and does not receive production credentials; record the first later versioned Nemlig runtime merge as the live protected-release acceptance case before archiving the change.
