## 1. Baseline and build proof

- [ ] 1.1 Refresh from current `origin/main`, confirm no active picker-path overlap, pin Node 22.23.1/pnpm 9.15.9, install the frozen lockfile once, and verify the focused picker/interface baseline passes.
- [ ] 1.2 Characterize the existing served resource and exact alternative-choice message, record raw/gzip size, and add the smallest built-artifact check covering structured/text payloads, empty/rejected states, hostile content, approved images, and one-send behavior.
- [ ] 1.3 Prove the pinned tsdown path can emit the required browser bundle and deterministic HTML without custom post-processing; if it cannot, prove the minimum isolated Vite single-file path, adding the React plugin only when required by the verified build.
- [ ] 1.4 Add only exact-tested React, React DOM, MCP Apps client, and proven build dependencies; verify frozen installation, peer compatibility, privacy/license checks, and one self-contained artifact with no bare imports or executable network load, then checkpoint commit the build proof.

## 2. Contract and React rendering

- [ ] 2.1 Extract only the browser-safe payload parser and approved image-origin rule, reusing Zod without duplicate DTOs; verify structured content wins, JSON text remains a fallback, and malformed or hostile values fail safely.
- [ ] 2.2 Implement one React root for every current picker state and factual field with native controls and existing CSS variables; verify the emitted artifact preserves keyboard use, focus visibility, reduced motion, text isolation, image alt/lazy/no-referrer behavior, and details expansion.
- [ ] 2.3 Preserve quantity as display-only and the exact available-alternative action; verify proposed and unavailable products cannot be chosen and no React path invokes proposal preparation, application, or a basket tool.
- [ ] 2.4 Run the React best-practices review against introduced TSX, remove unnecessary components or abstractions, and checkpoint commit the rendering slice with focused tests green.

## 3. Native host lifecycle

- [ ] 3.1 Implement one minimal MCP Apps host adapter that registers results before connection and owns one session per mount; verify a result delivered during connection renders without a second connection.
- [ ] 3.2 Block duplicate activation while `sendMessage` is pending, expose concise failure without automatic resend, and invalidate stale completion after result replacement or unmount; verify success, failure, repeated click, connection failure, replacement, cleanup, and remount with a fake local host.
- [ ] 3.3 Verify the adapter sends only `Choose product <id> for <ingredient> instead.`, performs no retry/reconnect/polling, and cannot apply a proposal or mutate a basket, then checkpoint commit the native lifecycle boundary.

## 4. Resource and package switch

- [ ] 4.1 Load the generated HTML beside the compiled MCP entry point while preserving URI, MIME type, gate, recognized false values, and conversational fallback; verify enabled/disabled registration tests pass.
- [ ] 4.2 Remove the inline picker and unpkg origin after verifying the artifact has no executable network load; confirm resource metadata retains only approved Nemlig product-resource origins.
- [ ] 4.3 Include the emitted picker in the clean tarball installation; verify browser source/tests are absent and the installed credential-free MCP server serves the resource without repository paths or unresolved imports.
- [ ] 4.4 Compare final raw/gzip size with baseline and the lowest verified supported-host ceiling, document the measured React adoption in `docs/dependency-landscape.md`, and stop rather than switch if the artifact exceeds that ceiling.

## 5. Integration and follow-ups

- [ ] 5.1 Run focused picker, interface, MCP safety, and package checks plus `pnpm privacy:check` and `pnpm verify`; record that no credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 5.2 Use the existing release planner for the epic's one version decision and release summary, push the completed branch, wait for required exact-head CI, merge through the active ruleset, and verify remote `main` and the protected deployment handoff.
- [ ] 5.3 After React integration, rebase and retarget the stacked `adopt-effect-picker-lifecycle` draft to merged `main`, keeping React behavior tests as its invariant.
- [ ] 5.4 After both adoption tracks merge or Effect is explicitly rejected, sync/archive their completed OpenSpec changes and open the separately scoped agent-artifact routing follow-up recorded in the proposal.
