## 1. Native baseline

- [ ] 1.1 Wait for the React picker implementation, identify its exact verified commit, rebase or retarget this branch to that commit, confirm exclusive host-adapter/test ownership, pin Node 22.23.1/pnpm 9.15.9, and complete one frozen install.
- [ ] 1.2 Run the React fake-host harness against the native adapter and verify connection/result timing, send success/failure, repeated activation, result replacement, connection failure, unmount, remount, and stale completion all satisfy the React lifecycle contract.
- [ ] 1.3 Verify the pinned MCP Apps SDK's callback registration, close, and pending-Promise behavior with the smallest focused reproducer; record which stale-state guard remains necessary.
- [ ] 1.4 Record the native adapter's raw/gzip picker bytes and manual acquisition, finalization, expected-failure, and stale-state coordination, then checkpoint commit only any missing baseline characterization tests.

## 2. Effect candidate

- [ ] 2.1 Add the exact current stable Effect 3 release as a temporary browser build input without changing the production adapter call site; verify frozen installation, peer compatibility, privacy/license checks, and absence from Node entry points.
- [ ] 2.2 Implement one isolated Effect scope around the existing SDK `App` construction, callback registration, connection, deliberate send, failure mapping, and finalization; verify there is no Effect platform, schema, layer/service hierarchy, retry, polling, reconnect, or second lifecycle owner.
- [ ] 2.3 Run the identical fake-host harness against the Effect candidate and verify it preserves the exact choice message, at-most-one send, explicit later retry, cleanup, remount, and stale-completion behavior without proposal application or basket mutation.

## 3. Evidence gate

- [ ] 3.1 Build both variants with the same React toolchain and record raw/gzip bytes, supported-host ceiling, lifecycle coordination removed or added, and any explicit guard that remains.
- [ ] 3.2 Apply the design's adoption gate and record one decision in `docs/dependency-landscape.md`: adopt only if behavior is green, size remains within the verified ceiling, one owner remains, and real manual cleanup/error coordination is removed without a parallel hierarchy.
- [ ] 3.3 If adopted, replace the one native adapter call site and remove the unused native implementation; if rejected, remove Effect and its candidate code while retaining the native adapter. Verify the final build contains exactly one lifecycle implementation and checkpoint commit the decision.

## 4. Integration and delivery

- [ ] 4.1 Run focused lifecycle, built-picker, package, and MCP safety checks plus strict OpenSpec validation, `pnpm privacy:check`, and `pnpm verify`; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 4.2 Reconcile the merged React revision and current `origin/main`, use the existing release planner for this pull request's separate version/release-note decision when runtime code remains, push the final branch, and wait for required exact-head CI.
- [ ] 4.3 Merge through the active ruleset only after React, verify remote `main` and the protected release/deployment handoff when applicable, and roll back Effect alone to the native adapter if acceptance fails.
- [ ] 4.4 Sync and archive `adopt-effect-picker-lifecycle` only after its adopt/reject outcome is integrated, then allow the separately scoped agent-artifact routing follow-up to start from the resulting `origin/main`.
