## 1. Baseline and MVP build proof

- [x] 1.1 Refresh current `origin/main`, confirm exclusive picker-path ownership, pin Node 22.23.1/pnpm 9.15.9, perform one frozen install, and verify the focused picker/interface baseline passes.
- [x] 1.2 Characterize the existing served resource, exact alternative-choice message, SDK/CDN cohort, and complete raw/gzip load boundary; replace renderer-spelling assertions with the smallest behavioral built-artifact checks.
- [x] 1.3 Pin compatible React/React DOM, Tailwind 4, Apps SDK UI, and ext-apps releases; record resolved peers, licenses, and dependency footprint without adding a router, provider, store, or unused UI control.
- [x] 1.4 Prove one deterministic self-contained HTML build using existing tsdown plus the smallest CSS/inlining step; use a minimal Vite single-file path only if that proof would require brittle custom bundling.
- [x] 1.5 Record the build decision, raw/gzip JavaScript and CSS contributions, the 1.5 MiB raw/350 KiB gzip project budget, and absence of executable/style/font network references before switching production resource loading.

## 2. MVP contract, rendering, and styling

- [x] 2.1 Extract only the browser-safe payload parser and approved image-origin rule, reusing Zod; verify structured content wins, JSON text remains a fallback, and malformed or hostile values fail safely.
- [x] 2.2 Implement one React root and shared product card for every current picker state and factual field; use Apps SDK UI `Button` and `Badge` where applicable and native semantic elements elsewhere.
- [x] 2.3 Apply Tailwind/UI tokens, supported host styles, system fonts, operating-system theme fallback, and only picker-specific layout/image CSS; remove unused remote font declarations and verify zero executable/style/font requests.
- [x] 2.4 Preserve quantity as display-only and one explicit available-alternative action; verify proposed/unavailable products cannot be chosen and no UI path invokes proposal preparation, application, or a basket tool.
- [x] 2.5 Verify keyboard navigation, visible focus, 44 px enabled targets, WCAG AA contrast, text resizing, reduced motion, image alt/lazy/no-referrer behavior, 320 px layout, no horizontal/nested scrolling, and host light/dark changes against the emitted artifact.
- [x] 2.6 Run the React best-practices and simplification reviews; verify one validator, one host owner, one shared card, no imperative DOM renderer/manual button mutation, and no local design-system or runtime abstraction.

## 3. MVP host lifecycle

- [x] 3.1 Test the pinned SDK React helper's callback-before-connect ordering, teardown, and resize cleanup; use it only if it meets the contract, otherwise implement one direct `App` effect with explicit close.
- [x] 3.2 Block duplicate activation synchronously while `sendMessage` is pending, expose concise failure without automatic resend, and invalidate stale completion after result replacement or unmount; verify success, failure, repeated click, connection failure, replacement, cleanup, and remount with a fake local host.
- [x] 3.3 Verify the adapter sends only `Choose product <id> for <ingredient> instead.`, performs no retry/reconnect/polling, and cannot apply a proposal or mutate a basket.

## 4. MVP resource and package switch

- [x] 4.1 Load generated HTML beside the compiled MCP entry point only when enabled while preserving URI, MIME type, gate, recognized false values, and conversational fallback; verify enabled/disabled registration tests pass.
- [x] 4.2 Remove the inline picker and unpkg origin only after the artifact has no executable, stylesheet, or font network load; verify CSP/resource metadata retains only approved Nemlig image origins.
- [x] 4.3 Produce byte-identical HTML in two clean builds and include it in a clean tarball installation; verify browser source/tests are absent and the credential-free MCP server serves the exact artifact without repository paths or unresolved imports.
- [x] 4.4 Record final resolved dependencies/licenses, package footprint, raw/gzip artifact and JS/CSS contributions in `docs/dependency-landscape.md`; state that the budgets are project choices and no authoritative host-size ceiling was found.

## 5. Integration and follow-ups

- [x] 5.1 Run focused picker, interface, MCP safety, accessibility, offline, package, performance-observation, privacy, OpenSpec, and final `pnpm verify` checks for the MVP baseline; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.

## 6. Production browser pipeline and shared design

- [x] 6.1 Replace the browser tsdown/CSS CLI/custom HTML assembly with pinned Vite, React, Tailwind Vite, and single-file plugins; retain tsdown for Node, remove superseded build dependencies, and prove deterministic `dist/picker.html` without post-build mutation.
- [x] 6.2 Correct the Apps SDK UI token names and CSS import order; adopt official host theme/variable/font and safe-area hooks with operating-system/system fallbacks and no competing host-context assignment.
- [x] 6.3 Preserve one callback-before-connect lifecycle owner, disposed resize handling, synchronous duplicate-send protection, stale generation invalidation, exact choice text, and explicit cleanup/remount behavior under executable tests.
- [x] 6.4 Extract the minimum pure production presentation and shared stylesheet used by both the host picker and a synthetic local design showcase; demonstrate required success/progress/empty/error and responsive light/dark states without live Nemlig calls.
- [x] 6.5 Keep executable/application assets embedded, allow only the exact optional OpenAI font origin plus existing product-image origins, and verify offline/denied fonts and images do not prevent rendering or choosing.
- [x] 6.6 Verify raw/gzip budgets, two-build identity, hostile inputs, accessibility, browser behavior, clean tarball serving, showcase exclusion, and correct decimal-byte labels; update dependency/build evidence.

## 7. Integration, deployment, and follow-ups

- [x] 7.1 Run focused checks, OpenSpec strict validation, package/version planning, privacy/safety verification, and final `pnpm verify`; record that implementation made no credential, provider, or basket mutation.
- [x] 7.2 Push the completed branch, wait for exact-head CI, mark PR #34 ready, merge through the active ruleset, and verify the exact remote `main` revision and merged-revision CI.
- [x] 7.3 Use the approved protected production workflow once for the exact merged revision, verify deployed-revision and health evidence, and perform sequential read-only acceptance without accessing or mutating basket/account/order state.
- [x] 7.4 Rebase and retarget the stacked functional-TypeScript comparison to merged `main`, keeping UI behavior tests as its invariant; hand the merged SHA to the parked agent-artifact routing pull request.
- [x] 7.5 Sync and archive the completed UI OpenSpec change independently after integration and production acceptance.
