## 1. Native baseline and comparison contract

- [ ] 1.1 Wait for the UI implementation, identify its exact verified commit, rebase or retarget this branch to it, confirm exclusive pure-core/host-adapter/test ownership, pin Node 22.23.1/pnpm 9.15.9, and complete one frozen install.
- [ ] 1.2 Define one representative pure-data transformation and reuse the UI fake-host lifecycle without widening into proposal application or server orchestration; verify native TypeScript passes all output and lifecycle assertions.
- [ ] 1.3 Record native production lines/constructs, explicit error and resource ownership, reviewer concepts, TypeScript diagnostics/time, raw/gzip output, dependency footprint, and remaining stale-state guards.
- [ ] 1.4 Verify the pinned MCP Apps client's callback, close, and pending-Promise behavior with the smallest reproducer; record which cancellation and stale-delivery guarantees remain manual.

## 2. Equivalent functional candidates

- [ ] 2.1 Compare native, fp-ts, and Effect pure modules on the identical view-model transformation; compare Remeda for collection transformation, neverthrow for expected failures, and ts-pattern only for actual structured branching. Verify identical plain outputs and record inference, diagnostics, required concepts, and code shape.
- [ ] 2.2 Compare native, fp-ts `TaskEither`/`bracket`, and stable Effect 3 scope/finalizers on the identical host lifecycle; verify connection/result timing, send success/failure, duplicate activation, replacement, unmount/remount, and stale completion.
- [ ] 2.3 Record Effect Micro's experimental status without installing it, and verify no Effect 4 RC, platform, schema, layer/service hierarchy, retry, polling, reconnect, or speculative candidate enters the production path.
- [ ] 2.4 Build candidates with the same UI toolchain and record actual raw/gzip output, TypeScript check time/diagnostics, peer and license compatibility, migration direction, resource/error coordination removed or added, and manual guards that remain.

## 3. Decision and production slice

- [ ] 3.1 Apply the design gate separately to pure and async needs, then select one coherent dependency model or native TypeScript. Verify the decision cites behavior, composition/error/resource clarity, comprehension, learning/migration cost, type-check budget, and browser budget rather than line count alone.
- [ ] 3.2 Record the selected/rejected candidates and measurements in `docs/dependency-landscape.md`; verify Effect remains preferred only if evidence supports the integrated model and narrow packages are not penalized for unrelated missing runtime features.
- [ ] 3.3 Delete every rejected candidate package and spike. Switch only selected production call sites and remove superseded native code, or retain native TypeScript if it wins; verify the final build has one dependency model and one lifecycle owner.
- [ ] 3.4 Run the identical pure-output and fake-host harness against the final implementation; verify the exact choice message, at-most-one send, later deliberate retry, cleanup, and stale-completion behavior without proposal application or basket mutation, then checkpoint commit the decision.

## 4. Integration and delivery

- [ ] 4.1 Run focused lifecycle, built-picker, package, and MCP safety checks plus strict OpenSpec validation, `pnpm privacy:check`, and `pnpm verify`; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 4.2 Reconcile the merged UI revision and current `origin/main`, use the release planner for this pull request's separate version decision when runtime code remains, push the final branch, and wait for exact-head CI.
- [ ] 4.3 Merge through the active ruleset only after the UI, verify remote `main` and the protected release/deployment handoff when applicable, and roll the FP dependency back to native TypeScript if acceptance fails.
- [ ] 4.4 Sync and archive this change only after its selection is integrated, then allow the separately scoped agent-artifact routing follow-up to start from resulting `origin/main`.
