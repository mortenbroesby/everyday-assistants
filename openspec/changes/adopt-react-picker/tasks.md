## 1. Baseline and stack decision

- [ ] 1.1 Refresh from current `origin/main`, confirm exclusive picker-path ownership, pin Node 22.23.1/pnpm 9.15.9, perform one frozen install, and verify the focused picker/interface baseline passes.
- [ ] 1.2 Characterize the existing served resource, exact alternative-choice message, SDK/CDN cohort, and raw/gzip size; add the smallest built-artifact check for payload variants, hostile content, approved images, and one-send behavior.
- [ ] 1.3 Build bundled native TypeScript, React, and Preact with the same fixture, compatible ext-apps/SDK 1 cohort, CSS, minification, production settings, and assertions; record raw/gzip output, initialization/render behavior, dependency/typing cost, and the selected renderer without creating a reusable benchmark harness.
- [ ] 1.4 Record React as selected only if the equal comparison preserves behavior and fits the measured project budget; otherwise select Preact or native and update the change artifacts before implementation. Verify no Inferno, Tailwind, OpenAI UI, or rejected renderer dependency remains.
- [ ] 1.5 Prove pinned tsdown can emit one deterministic HTML artifact; if not, prove the minimum Vite single-file path, adding only verified-required plugins, then checkpoint commit the build proof with frozen installation and privacy/license checks green.

## 2. Contract, rendering, and styling

- [ ] 2.1 Extract only the browser-safe payload parser and approved image-origin rule, reusing Zod; verify structured content wins, JSON text remains a fallback, and malformed or hostile values fail safely.
- [ ] 2.2 Implement one root for every current picker state and factual field using native controls, local state, native CSS, supported host variables, and system fonts; verify the built artifact in host light/dark themes and narrow/mobile layouts without nested scrolling.
- [ ] 2.3 Verify keyboard navigation, visible focus, WCAG AA contrast, text resizing, reduced motion, image alt/lazy/no-referrer behavior, safe-area spacing, and details expansion against the emitted artifact.
- [ ] 2.4 Preserve quantity as display-only and one explicit available-alternative action; verify proposed/unavailable products cannot be chosen and no UI path invokes proposal preparation, application, or a basket tool.
- [ ] 2.5 Run the applicable framework best-practices review, remove unnecessary components or abstractions, and checkpoint commit with focused tests green. Add Tailwind/OpenAI UI only after documenting a concrete component benefit and measuring emitted CSS.

## 3. Native host lifecycle

- [ ] 3.1 Inspect the pinned compatible SDK helper and use it only if it preserves callback-before-connect ordering and cleanup; otherwise implement one minimal `App` adapter. Verify a result during connection renders without a second owner.
- [ ] 3.2 Block duplicate activation while `sendMessage` is pending, expose concise failure without automatic resend, and invalidate stale completion after result replacement or unmount; verify success, failure, repeated click, connection failure, replacement, cleanup, and remount with a fake local host.
- [ ] 3.3 Verify the adapter sends only `Choose product <id> for <ingredient> instead.`, performs no retry/reconnect/polling, and cannot apply a proposal or mutate a basket, then checkpoint commit the lifecycle boundary.

## 4. Resource and package switch

- [ ] 4.1 Load generated HTML beside the compiled MCP entry point while preserving URI, MIME type, gate, recognized false values, and conversational fallback; verify enabled/disabled registration tests pass.
- [ ] 4.2 Remove the inline picker and unpkg origin only after the artifact has no executable network load; verify CSP/resource metadata retains only required approved origins.
- [ ] 4.3 Include the emitted picker in a clean tarball installation; verify browser source/tests are absent and the credential-free MCP server serves it without repository paths or unresolved imports.
- [ ] 4.4 Record final raw/gzip size, the measured project budget, and the selected UI stack in `docs/dependency-landscape.md`; explicitly note that no authoritative host-size ceiling was found.

## 5. Integration and follow-ups

- [ ] 5.1 Run focused picker, interface, MCP safety, accessibility, and package checks plus `pnpm privacy:check` and `pnpm verify`; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 5.2 Use the existing release planner for one version decision, push the completed branch, wait for exact-head CI, merge through the active ruleset, and verify remote `main` plus the protected deployment handoff.
- [ ] 5.3 After UI integration, rebase and retarget the stacked functional-TypeScript comparison to merged `main`, keeping UI behavior tests as its invariant.
- [ ] 5.4 After both adoption tracks are resolved, sync/archive their completed OpenSpec changes and open the separately scoped agent-artifact routing follow-up.
