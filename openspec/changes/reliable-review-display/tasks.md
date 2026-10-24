Delivery status and user-facing stories: [epic #347](https://github.com/mortenbroesby/everyday-assistants/issues/347). This checklist tracks the specification's implementation dependencies. Astra owns planning and integration; Terra owns code and focused tests.

## 1. Contract and baseline

- [x] 1.1 Establish a fresh branch/worktree from main including #346 and bootstrap Node 24.13.0/pnpm 9.15.9; verify base SHA and successful frozen-lockfile install.
- [x] 1.2 Validate the display contract and epic before implementation; strict OpenSpec validation must pass and the canonical issue must read back correctly.
- [x] 1.3 Open one early draft PR with the design, scope, and pending acceptance clearly described; verify its branch/base and attach it to the task.

## 2. Dedicated display and routing

- [x] 2.1 Add the strict read-only `show_product_review` tool with draft and saved-list display modes; MCP tests verify annotations, schema, result shape, and zero provider writes.
- [x] 2.2 Reuse exact owner/context binding and safe current-session lookup; focused tests cover omitted handles, stateless exact handles, wrong owner, mismatched pair, expiry/restart, and no fallback/recreation.
- [x] 2.3 Separate hosted rendering metadata from start/update, preserve stable UI resource and app callbacks, and keep stdio text-only; catalog tests verify the eight-tool surface and service-principal restrictions.
- [x] 2.4 Update natural-language metadata, server guidance, README and relevant MCP instructions; verify direct/indirect English and Danish examples plus actual-basket/text-only exclusions, without introducing keyword-based mutation authority.

## 3. Connected experience and regressions

- [x] 3.1 Migrate production-acceptance inventory and relevant fixtures to the display tool; focused acceptance tests detect catalog/metadata drift.
- [x] 3.2 Exercise repeated display and display during edits/submission/uncertainty without altering identity, contents or authorization; focused integration tests verify zero hidden writes and preserved no-replay behavior.
- [x] 3.3 Update the existing adapter/artifact smoke to create → display → edit → display → explicit synthetic Submit → result; run the affected combined smoke and retain unavailable/legacy-card isolation assertions.
- [x] 3.4 Add a bounded golden prompt matrix and native-host runbook/evidence template; verify cases include direct, indirect, Danish, negative, ambiguous, actual-basket and stale-context outcomes and explicitly distinguish expected versus observed routing/rendering.
- [x] 3.5 Measure serialized tool-catalog size before/after with existing MCP fixtures or a bounded local script; record the delta without adding a new evaluation dependency or cost.

## 4. Integration and handoff

- [x] 4.1 Format changed executable files, run fast lint and focused tests, and review the final diff; record passing commands and concrete safety findings without duplicating comprehensive CI suites locally.
- [x] 4.2 Commit/push with normal hooks, reconcile current main, and inspect exact-head CI and review findings; keep failures/pending checks explicit.
- [x] 4.3 Reconcile epic, OpenSpec, README and PR status; report exact commit, automated evidence, migration notes and remaining release/native-host gates. No version bump, merge or deployment is part of this implementation task.

Implementation evidence: code checkpoint `2fb2e7f` passed exact-head [CI run 40091765096](https://github.com/mortenbroesby/everyday-assistants/actions/runs/40091765096), including verify, Fallow, 443 app tests, build/type checks, and both browser smoke suites. Normal hooks passed, current main remains `254789f`, and Astra's integration review plus independent source review findings were addressed. Epic #347 and PR #348 track final-head checks and the additional manual CodeRabbit review; its earlier automatic success status represented a skipped review. Native-host acceptance is not inferred from any automated result.

Native-host release acceptance remains a separate open epic gate until the candidate can be accessed through an approved connection. The implementation must deliver its repeatable procedure and honest evidence status; it must not claim this gate from local metadata or synthetic browser tests.
