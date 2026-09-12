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
- [x] 3.3 Commit and push the feature branch, open a pull request, confirm ruleset `Protect main with pull requests` and exact-head `verify` are active, then merge through GitHub and verify remote `main` contains the merge; PR #21 merged as `4b2852ab5cce541a151d59dfcd085e308018d7b7` with exact-head `verify` green and the ruleset active.
- [x] 3.4 Verify an ineligible merged change stops before production credentials and record a later versioned Nemlig runtime merge as the live protected-release acceptance case; documentation merge `2852b5b94bed5172cb038dac035462bcea1e8d52` skipped deployment after a successful gate, while runtime merge `f3dbc98f466957996790e711546fb3ecd702843b` passed CI and protected production workflow run `34629300433`.

## 4. Use one epic delivery boundary

- [x] 4.1 Update this proposal, design, and task list so one coherent epic normally owns one branch, pull request, version decision, and deployment boundary; allow related OpenSpec changes and checkpoint commits inside it, with small pull requests retained for urgent or independently risky changes.
- [x] 4.2 Update `openspec/config.yaml`, `AGENTS.md`, Definition of Ready, and Definition of Done with the same boundary and the smallest safe completed-worktree cleanup rule; do not change deployment code or workflows.
- [x] 4.3 Enable GitHub merged-branch deletion and remove only clean, inactive, recoverable completed worktrees; verify `delete_branch_on_merge` reads back `true`, preserve branch refs, and keep the active task, primary checkout, and parked kill-switch worktree.
- [x] 4.4 Run focused guidance checks, strict OpenSpec validation, and one final `pnpm verify`; review the diff and prepare one merge-ready epic branch and pull request. Record exact-head CI, remote `main`, and completed-worktree cleanup as post-merge delivery evidence outside this pre-merge checklist.
