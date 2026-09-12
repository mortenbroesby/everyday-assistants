## 1. Baseline and MVP build proof

- [x] 1.1 Refresh current `origin/main`, confirm exclusive picker-path ownership, pin Node 22.23.1/pnpm 9.15.9, perform one frozen install, and verify the focused picker/interface baseline passes.
- [ ] 1.2 Characterize the existing served resource, exact alternative-choice message, SDK/CDN cohort, and complete raw/gzip load boundary; replace renderer-spelling assertions with the smallest behavioral built-artifact checks.
- [ ] 1.3 Pin compatible React/React DOM, Tailwind 4, Apps SDK UI, and ext-apps releases; record resolved peers, licenses, and dependency footprint without adding a router, provider, store, or unused UI control.
- [ ] 1.4 Prove one deterministic self-contained HTML build using existing tsdown plus the smallest CSS/inlining step; use a minimal Vite single-file path only if that proof would require brittle custom bundling.
- [ ] 1.5 Record the build decision, raw/gzip JavaScript and CSS contributions, the 1.5 MiB raw/350 KiB gzip project budget, and absence of executable/style/font network references before switching production resource loading.

## 2. Contract, rendering, and styling

- [ ] 2.1 Extract only the browser-safe payload parser and approved image-origin rule, reusing Zod; verify structured content wins, JSON text remains a fallback, and malformed or hostile values fail safely.
- [ ] 2.2 Implement one React root and shared product card for every current picker state and factual field; use Apps SDK UI `Button` and `Badge` where applicable and native semantic elements elsewhere.
- [ ] 2.3 Apply Tailwind/UI tokens, supported host styles, system fonts, operating-system theme fallback, and only picker-specific layout/image CSS; remove unused remote font declarations and verify zero executable/style/font requests.
- [ ] 2.4 Preserve quantity as display-only and one explicit available-alternative action; verify proposed/unavailable products cannot be chosen and no UI path invokes proposal preparation, application, or a basket tool.
- [ ] 2.5 Verify keyboard navigation, visible focus, 44 px enabled targets, WCAG AA contrast, text resizing, reduced motion, image alt/lazy/no-referrer behavior, 320 px layout, no horizontal/nested scrolling, and host light/dark changes against the emitted artifact.
- [ ] 2.6 Run the React best-practices and simplification reviews; verify one validator, one host owner, one shared card, no imperative DOM renderer/manual button mutation, and no local design-system or runtime abstraction.

## 3. Host lifecycle

- [ ] 3.1 Test the pinned SDK React helper's callback-before-connect ordering, teardown, and resize cleanup; use it only if it meets the contract, otherwise implement one direct `App` effect with explicit close.
- [ ] 3.2 Block duplicate activation synchronously while `sendMessage` is pending, expose concise failure without automatic resend, and invalidate stale completion after result replacement or unmount; verify success, failure, repeated click, connection failure, replacement, cleanup, and remount with a fake local host.
- [ ] 3.3 Verify the adapter sends only `Choose product <id> for <ingredient> instead.`, performs no retry/reconnect/polling, and cannot apply a proposal or mutate a basket.

## 4. Resource and package switch

- [ ] 4.1 Load generated HTML beside the compiled MCP entry point only when enabled while preserving URI, MIME type, gate, recognized false values, and conversational fallback; verify enabled/disabled registration tests pass.
- [ ] 4.2 Remove the inline picker and unpkg origin only after the artifact has no executable, stylesheet, or font network load; verify CSP/resource metadata retains only approved Nemlig image origins.
- [ ] 4.3 Produce byte-identical HTML in two clean builds and include it in a clean tarball installation; verify browser source/tests are absent and the credential-free MCP server serves the exact artifact without repository paths or unresolved imports.
- [ ] 4.4 Record final resolved dependencies/licenses, package footprint, raw/gzip artifact and JS/CSS contributions in `docs/dependency-landscape.md`; state that the budgets are project choices and no authoritative host-size ceiling was found.

## 5. Integration and follow-ups

- [ ] 5.1 Run focused picker, interface, MCP safety, accessibility, offline, package, performance-observation, privacy, OpenSpec, and final `pnpm verify` checks; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 5.2 Use the existing release planner for one version decision, push the completed branch, wait for exact-head CI, merge through the active ruleset, and verify remote `main` plus the protected deployment handoff.
- [ ] 5.3 After UI integration, rebase and retarget the stacked functional-TypeScript comparison to merged `main`, keeping UI behavior tests as its invariant.
- [ ] 5.4 Sync and archive the completed UI OpenSpec change independently; track the separately scoped agent-artifact routing follow-up without making it or #36 a UI completion dependency.
