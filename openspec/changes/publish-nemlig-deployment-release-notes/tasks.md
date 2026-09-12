## 1. Specify and characterize

- [x] 1.1 Validate this change strictly and confirm it narrows only GitHub
  deployment-release tags while npm publication and package privacy remain
  unchanged.
- [ ] 1.2 Add a direct `relevantProduct` characterization matrix covering
  duplicates, empty and quantity-only queries, Danish accents, pet cases,
  compound joining, and the five-character prefix boundary; establish green.
- [ ] 1.3 Materialize requested words once in `relevantProduct`; rerun focused
  planning and MCP interface tests and verify behavior is unchanged.

## 2. Validate reviewed release notes

- [ ] 2.1 Add failing tests for eligible and ineligible exact ranges, missing or
  malformed notes, wrong versions, notes absent from the candidate diff, and
  bounded valid Markdown.
- [ ] 2.2 Implement the minimal release-note validation by reusing the existing
  changed-file reader and package version decision; add no dependency or second
  path classifier.
- [ ] 2.3 Wire the exact-base/exact-head CI version gate to require a valid note
  only for release-bearing changes; document the agent-authored note and PR
  review workflow.

## 3. Publish only verified deployments

- [ ] 3.1 Add failing tests for wrong SHA/run, failed, rolled-back, incomplete,
  live-pending, and missing routine acceptance journals plus a valid journal.
- [ ] 3.2 Implement deterministic journal validation and an idempotent GitHub
  prerelease publisher covering first publish, matching no-op, partial creation,
  conflicts, and uncertain-response reconciliation.
- [ ] 3.3 Add a downstream publication job that downloads the producing deploy
  artifact, checks out the exact candidate, validates before `contents: write`,
  and preserves approval, concurrency, timeouts, manual finalize, supervised
  cutover, and recovery behavior.
- [ ] 3.4 Add focused workflow contracts and operator guidance for readback and
  publisher-only retry within the seven-day artifact window.

## 4. Trial, integrate, and accept

- [ ] 4.1 Reconcile latest `origin/main`, calculate one final patch prerelease,
  and create its reviewed note; copy the summary into the pull request.
- [ ] 4.2 Run focused tests, representative mocked publisher smoke, strict
  OpenSpec validation, package/artifact checks, and one final `pnpm verify`.
- [ ] 4.3 Review for secrets, unrelated changes, dependencies, retries, capacity,
  or cost growth; commit and push the epic branch, open one pull request, verify
  exact-head CI, merge through the ruleset, and verify integrated-SHA CI.
- [ ] 4.4 Obtain the existing production-environment approval, verify one
  successful exact-SHA deployment and matching GitHub prerelease, and record the
  deployment run, release URL, tag target, and note-body evidence before archive.
