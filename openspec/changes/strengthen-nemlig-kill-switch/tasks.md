## 1. Model Safe Drill State

- [ ] 1.1 Add strict allowlisted schemas for Wrangler deployment, version, Container-application, and instance JSON plus the sanitized drill record; verify fixtures accept the pinned Wrangler shapes and reject split traffic, unknown required fields, unsafe records, and ambiguous Container identity.
- [ ] 1.2 Implement compatible disabled-version selection using the active application revision, exact switch classification, and safety-relevant bindings/settings; verify tests cover one valid pair, no pair, multiple candidates, revision mismatch, and binding or capacity drift.
- [ ] 1.3 Implement the explicit drill phase state machine and confirmation value bound to starting deployment/version/revision; verify tests reject stale confirmation, skipped phases, a second unfinished drill, and every unrecognized transition.

## 2. Preserve Recoverable Local Evidence

- [ ] 2.1 Add atomic restrictive-permission record writes and reads under an ignored app-local runtime directory with a configurable test path; verify interruption fixtures leave either the previous complete JSON record or the new complete JSON record, never a partial file.
- [ ] 2.2 Add bounded completed-record rotation and privacy assertions; verify records contain only documented identifiers, timestamps, phases, coarse outcomes, latencies, and correlation references and exclude representative credentials, tokens, headers, arbitrary output, requests, shopping data, and raw errors.

## 3. Add Bounded Provider Adapters

- [ ] 3.1 Add a thin pinned-Wrangler adapter for JSON deployment/version/Container inspection and explicit version-targeted rollback; verify exact argument tests prohibit deploy/upload, implicit rollback targets, traffic splits, shell execution, and unbounded retries.
- [ ] 3.2 Add bounded canonical and fallback disabled-edge probes that require HTTP 503, the exact fixed body, and request correlation IDs; verify success, wrong status/body, missing ID, timeout, and network ambiguity fixtures without contacting production.
- [ ] 3.3 Reuse the enabled production edge verifier and add bounded Container inactivity inspection for the fixed application; verify restored revision/metadata/rejection evidence and running, stopping, inactive, missing, or ambiguous instance cases.

## 4. Orchestrate Plan, Execute, Status, and Resume

- [ ] 4.1 Implement default read-only `plan` mode to inspect the single active version, find or validate a compatible disabled version, check the one-Container safety baseline, and print the exact outage, bounded operations, cost statement, confirmation value, and restoration target; verify no mutating adapter can be called.
- [ ] 4.2 Implement `execute` with record-before-mutation, fresh deployment compare-and-swap checks, one at-most-once disable rollback, disabled edge/no-running-instance proof, one exact restoration rollback, and enabled/no-running-instance proof; verify the success path performs exactly two mutations in order.
- [ ] 4.3 Implement read-only `status` and recovery-aware `resume`; verify interruption after every phase, ambiguous rollback readback, restoration failure under the drill's disabled version, and concurrent unknown deployment drift all produce the specified fail-closed result without blind mutation retries.
- [ ] 4.4 Add the `production:kill-switch` package command and CLI help while keeping live execution behind an explicit mode and exact confirmation; verify help and default invocation describe or perform read-only behavior only.

## 5. Document and Verify Repository Delivery

- [ ] 5.1 Update `.gitignore`, production readiness, Cloudflare operations, and the claimed kill-switch backlog checklist with command usage, interruption recovery, bounded cost model, immutable-version prerequisite, manual fallback, and separate production authorization; verify links, commands, and safety wording agree without exposing live identifiers as secrets.
- [ ] 5.2 Run focused kill-switch tests, strict validation for this OpenSpec change, `pnpm verify`, privacy checking, packed-package smoke, and the Cloudflare production dry run; verify no provider, Auth0, DNS, publication, saved-state, or basket mutation occurs and no limit, retry, service, dependency, or Container capacity changes.
- [ ] 5.3 Inspect the scoped diff for overlap with concurrent backlog work, rebase or merge the latest `origin/main` without overwriting sibling changes, then commit and push `codex/strengthen-kill-switch`; verify the remote branch, exact commit, and exact-head CI.

## 6. Run the Separately Authorized Production Drill

- [ ] 6.1 After separate explicit owner authorization, run `production:kill-switch plan`, review the exact starting and disabled versions plus fixed cost/safety summary, and execute that unchanged confirmation; verify both routes are disabled, zero Container instances are running, the exact starting version is restored, enabled edge acceptance passes, and the sanitized record reports completion without any Nemlig or saved-state mutation.
- [ ] 6.2 If the live exercise exposes an unsupported provider shape or recovery gap, stop in the last proven safe state, update the design and implementation without weakening the contract, rerun repository verification and exact-head CI, then perform a newly authorized drill rather than reusing the old confirmation.
