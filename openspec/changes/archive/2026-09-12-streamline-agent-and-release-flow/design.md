## Context

`main` already has an active GitHub ruleset requiring pull requests, resolved
review threads, and the strict `verify` check. The production workflow already
starts after successful push CI but uses a pull-request label to decide whether
to continue. CI already enforces the package-scoped Nemlig version policy.

The repository guidance currently repeats full verification without a bounded
iteration rule, and its Sol wording can be read as requiring a coordinator
sub-agent. New worktrees also lack installed dependencies until bootstrapped.

## Goals / Non-Goals

**Goals:**

- Make local failure reproduction the iteration loop and reserve full CI for a
  final candidate.
- Make one coherent epic the normal branch, pull-request, version, and release
  boundary while allowing related OpenSpec changes and checkpoint commits
  inside it.
- Preserve PR-only integration and turn a versioned Nemlig merge into one
  protected release candidate without a label.
- Notify a remote user once when progress truly requires their input.

**Non-Goals:**

- Publishing the private package, removing production approval, adding a
  notification service, or changing the deployment command and recovery model.

## Decisions

### Use the epic as the delivery boundary

One outcome normally owns one dedicated worktree and branch, one pull request,
one version decision near merge, and at most one production deployment. Related
OpenSpec changes may share that epic when they have the same acceptance and
release boundary. Checkpoint commits remain useful inside the branch, but they
do not each require a pull request.

Small pull requests remain appropriate for urgent fixes or changes whose risk
should be reviewed and released independently. This is an exception based on
outcome and risk, not a commit-size target.

After integration, GitHub deletes the merged remote branch. A local worktree is
removed only when it is clean, inactive, and its commits remain recoverable from
`main`, a retained branch, or the merged pull request. Deliberately parked work
keeps its worktree.

### Reuse the package release decision

The release gate will check out the exact CI-green merge with full history and
reuse the existing version-policy code through a small machine-readable mode.
It will compare the exact previous-main base and candidate, return eligible or
ineligible, and validate the required committed version. Manual dispatch remains
eligible by explicit operator input. This keeps changed-path rules in one place.

Comparing only workflow paths or keeping a label were rejected because both
duplicate the established package policy and can drift from CI.

### Keep production approval and exact-source gates

Eligibility only submits the existing protected release. The environment
reviewer still approves access to production secrets, and preflight still
revalidates the exact SHA, trusted CI, current `main`, lease, and provider state.
No automatic retry is added.

### Make repository verification progressive

Definition of Ready will require one worktree bootstrap using Node 22.23.1,
pnpm 9.15.9, and one frozen install. Iteration uses the smallest failing
reproducer. After two failures without new evidence, the agent records a reality
check and changes the hypothesis before another run. Definition of Done runs the
focused check, one representative end-to-end smoke test for behavior changes,
then `pnpm verify` once for the final candidate; it repeats only after a relevant
diff or a diagnosed failure.

The pre-push hook runs the existing package version check against the branch
merge-base before the existing full verification. CI remains authoritative.

### Use one quiet decision heartbeat

For long-running tasks, the main thread creates or updates one thread heartbeat
that alerts only when a named decision, approval, credential action, or other
human input blocks progress. It includes the exact requested action and reason,
does not repeat unchanged requests, and is disabled when the task completes.
This reuses ChatGPT task notifications rather than adding a messaging service.

## Risks / Trade-offs

- [A malformed merge range starts or skips a release] → require an exact merged
  pull request, ancestor base, candidate SHA, trusted CI, and version-policy
  result before exposing production credentials.
- [Automatic submissions increase cost] → skip ineligible merges before install
  or provider access, retain approval, one concurrency group, bounded execution,
  and no retries or schedules.
- [A notification repeats or outlives work] → reuse one named heartbeat, suppress
  unchanged alerts, and disable it at completion.
- [A narrow test misses integration failure] → require one representative smoke
  test and the full repository gate on the final candidate.
- [Worktree cleanup removes unfinished work] → require clean, inactive, and
  recoverable-state checks; keep any unresolved or deliberately parked worktree.

## Migration Plan

1. Update OpenSpec and repository guidance with the epic delivery boundary;
   enable merged-branch deletion and remove only proven-complete local
   worktrees without changing production state.
2. Update the pre-push hook and verify its focused commands without changing
   GitHub or production state.
3. Add failing workflow and version-policy tests for eligible and ineligible
   merge ranges, then replace the label gate.
4. Run the focused tests, representative smoke test, strict OpenSpec validation,
   and one final `pnpm verify`.
5. Open a pull request, verify the active ruleset blocks direct integration and
   exact-head CI passes, then merge through GitHub.
6. This workflow-only merge is ineligible for a Nemlig release. The next
   versioned Nemlig runtime merge exercises the new protected submission path;
   rollback restores the label-gated workflow if selection is wrong.
