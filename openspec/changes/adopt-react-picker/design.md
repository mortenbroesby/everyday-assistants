## Context

See [proposal.md](proposal.md) for motivation. `src/mcp.ts` currently embeds the complete minified picker, imports MCP Apps client 0.4.0 from unpkg, and serves it behind `NEMLIG_MCP_APPS`. The picker displays an already reviewed proposal and sends one exact alternative-choice message; quantity is display-only and it cannot apply basket changes.

The package uses MCP SDK `^1.30.0`, Zod `^4.5.4`, and tsdown `0.22.14`, with no browser build. Registry evidence on 2026-09-12 shows ext-apps 0.4.0 peers with SDK `^1.24.0`, 1.7.5 with `^1.29.0`, and 2.0.0 with the split MCP 2 packages. Implementation must pin and test a compatible SDK 1 cohort rather than copying current MCP 2 examples.

OpenAI's [UI integration guide](https://developers.openai.com/plugins/build/chatgpt-ui) uses React, recommends a lean dependency set and self-contained component bundle, and treats the resource URI as a cache key. Its [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines) recommend focused inline cards, system styling, and accessibility. MCP Apps remains framework-neutral and publishes vanilla, React, and Preact examples.

## Goals / Non-Goals

**Goals:**

- Select the UI stack with an equal, bounded built-artifact comparison before replacing the current picker.
- Keep payload normalization pure and host effects in one minimal native adapter.
- Preserve behavior, accessibility, packaging, and safety before any FP-runtime experiment.

**Non-Goals:**

- No new picker feature, editable quantity, basket call, router, global store, generic UI platform, or host-service abstraction.
- No FP runtime, server orchestration conversion, authentication change, proposal/application change, or protocol-major migration.

## Decisions

### 1. Prefer React after one bounded native/React/Preact comparison

Use the same representative proposal fixture, MCP Apps client version, CSS, minification, production bundler settings, and behavioral checks for all three candidates. Record raw/gzip HTML, initialization/render behavior, dependency and typing cost, then choose once.

| Candidate | Evidence and decision |
| --- | --- |
| Bundled native TypeScript | Smallest dependency baseline and fully capable of removing the CDN, but retains manual rendering/state coordination. Keep as fallback. |
| React | Preferred: direct OpenAI component guidance, optional MCP Apps hooks, and compatibility with the optional OpenAI UI library support the requested long-term component workflow. |
| Preact | The only compact challenger: MCP Apps publishes an official Preact example. Compare its native hooks and framework-neutral `App` path without assuming React-library compatibility. |
| Inferno | Do not prototype. It adds a separate compatibility surface and has no comparable official MCP Apps example; claimed core speed does not establish a win for this resource. |

React is an ecosystem and maintainability decision, not a ChatGPT requirement or presumed performance winner. Stop with native or Preact if the equal build disproves React's value or exceeds the recorded project budget. Do not create a reusable benchmark framework.

### 2. Use native CSS and host tokens first

Retain the small existing stylesheet while replacing hard-coded theme choices with supported host CSS variables and system fonts. Use native buttons and details, visible focus, WCAG AA contrast, text resizing, reduced motion, narrow/mobile layout, safe-area spacing, and no nested scrolling.

OpenAI's optional [`@openai/apps-sdk-ui`](https://github.com/openai/apps-sdk-ui) currently requires React 18/19 and Tailwind 4. Tailwind generates static CSS, but the current native controls do not justify adding both layers. Revisit them only when repeated styled components or a complex accessible interaction yields a concrete reduction in local UI code; measure emitted CSS before adoption.

### 3. Prefer the existing bundler, add only proven tooling

First prove whether pinned tsdown can emit the chosen browser code and one deterministic HTML file without custom post-processing. If not, use the official MCP Apps Vite/single-file pattern; add framework plugins only when the verified build requires them. Node entry points remain on tsdown.

The server reads generated HTML beside its compiled entry point. Browser libraries are bundled build inputs; the tarball contains no bare import or uncompiled browser source. Separate JavaScript/CSS resources or custom assembly are acceptable only if demonstrably smaller and equally deterministic.

### 4. Keep one native host-lifecycle owner

Inspect the compatible SDK's framework helper before duplicating it. Use it only if it preserves callback-before-connect ordering and required cleanup; otherwise use `App` directly. Connect once, block duplicate activation while `sendMessage` is pending, show concise failure, allow only a later deliberate retry, and invalidate stale completions. No automatic retry, reconnect, polling, or resend.

The adapter sends exactly `Choose product <id> for <ingredient> instead.` and exposes no apply or basket tool. Temporary view state stays local and business data comes only from validated tool results.

### 5. Keep one browser-safe contract and verify the packed result

Extract only the picker parser and approved image-origin rule into a browser-safe leaf, reuse Zod, prefer structured content over JSON-text fallback, and create no duplicate DTO hierarchy.

Tests load the built HTML with a fake local host and cover payload variants, hostile content, action semantics, connection/send failures, replacement and cleanup. Package smoke reads the resource from a clean tarball. Preserve the URI for this behavior-compatible migration; a later breaking HTML/JS/CSS contract uses a new URI. Keep CSP origins narrow and remove unpkg only after the artifact has no executable network load.

No authoritative host-size ceiling was found. Record that fact, establish a measured project budget from the current artifact and equal candidates, and do not present the budget as a platform limit.

## Risks / Trade-offs

- [React increases resource bytes] -> Compare identical built candidates and keep the smallest passing fallback.
- [Preact compatibility differs from React] -> Use its native MCP Apps example and do not alias React-only packages in the comparison.
- [Tailwind or a design system grows the stack without value] -> Defer both until a concrete component need and emitted-CSS measurement exist.
- [SDK examples cross a protocol-major boundary] -> Pin and test an SDK 1-compatible ext-apps release.
- [Build output is erased or omitted] -> Verify build ordering and clean packed-resource loading.
- [Lifecycle cleanup changes messaging] -> Characterize the exact message and run identical fake-host scenarios.

## Migration Plan

1. Characterize the current resource, then run the equal native/React/Preact production build and record the decision.
2. Prove the minimum single-file build and clean packed-resource path.
3. Move parsing and selected rendering while retaining the old resource until built-artifact parity passes.
4. Add the single host adapter, switch the resource loader, and remove the inline document and unpkg origin.
5. Run focused, package, privacy, accessibility, and repository gates; use the existing release workflow for one version decision.
6. Roll back with `NEMLIG_MCP_APPS` or restore the prior release. No data migration is required.
