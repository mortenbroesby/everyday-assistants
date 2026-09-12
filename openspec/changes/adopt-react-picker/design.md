## Context

See [proposal.md](proposal.md) for motivation. `src/mcp.ts` currently embeds the complete imperative picker, imports MCP Apps client 0.4.0 from unpkg, and serves it behind `NEMLIG_MCP_APPS`. The HTML is 5,955 bytes raw and 2,353 bytes gzip but excludes its remotely loaded runtime, so it is not a complete load-size comparison. The picker displays an already reviewed proposal and sends one exact alternative-choice message; quantity is display-only and it cannot apply basket changes.

The package uses MCP SDK `^1.30.0`, Zod `^4.5.4`, and tsdown `0.22.14`, with no browser CSS pipeline. Verified package evidence on 2026-09-12 shows `@modelcontextprotocol/ext-apps` 1.7.5 peers with SDK `^1.29.0`, Zod 3/4, and React 17/18/19. OpenAI Apps SDK UI 0.2.2 is MIT-licensed and peers with React 18/19 and Tailwind `^4.0.10`.

OpenAI's [UI integration guide](https://developers.openai.com/plugins/build/chatgpt-ui) recommends a lean, self-contained component bundle and treats the resource URI as a cache key. Its [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines) recommend focused inline cards, system styling, and accessibility. The optional [Apps SDK UI library](https://github.com/openai/apps-sdk-ui) supplies the selected React components and Tailwind tokens; it is not the MCP host bridge.

## Goals / Non-Goals

**Goals:**

- Prove React, Tailwind 4, and Apps SDK UI on the real picker and ship them when the explicit gates pass.
- Remove imperative DOM construction and manual visual-state mutation in favor of one shared declarative product card.
- Keep payload normalization pure and host effects in one tested lifecycle owner.
- Preserve behavior, accessibility, deterministic packaging, narrow CSP, and safety before any FP-runtime experiment.

**Non-Goals:**

- No native/React/Preact bake-off, new picker feature, editable quantity, basket call, router, global store, generic UI platform, patched dependency, or host-service abstraction.
- No FP runtime, server orchestration conversion, authentication change, proposal/application change, protocol-major migration, or repository-wide UI mandate.

## Decisions

### 1. Build the selected stack, with a measured contingency

Use React 19, React DOM, Tailwind 4, and `@openai/apps-sdk-ui`. Use `Button` for available-alternative actions and `Badge` for existing proposed/favorite status where it improves clarity. Keep `<article>`, `<section>`, `<details>`, `<summary>`, and `<img>` native. Do not add `AppsSDKUIProvider`, a router, input/select controls, a store, or a local component layer.

The MVP passes when it preserves all specified behavior, makes no executable/style/font request, is deterministic, meets the accessibility gates, and stays at or below 1.5 MiB raw and 350 KiB gzip. These are generous project budgets chosen to expose accidental whole-library or remote-asset bundling; maintainability and correctness remain primary. A failure produces a named measured problem and a correction attempt before native rendering is reconsidered.

Maintainability is evidenced by one payload validator, one host owner, one shared product card, no `document.createElement`/`innerHTML` renderer, no manual button-text mutation, and behavior tests that do not depend on implementation spellings.

### 2. Use Tailwind tokens without inheriting remote assets

Follow the library's documented Tailwind order: import Tailwind, import `@openai/apps-sdk-ui/css`, declare the package source, then add only picker layout/image rules. Use system fonts and supported host style variables.

The published UI stylesheet includes KaTeX font declarations that reference `https://cdn.openai.com`. The picker uses no math. The build must remove unused remote font declarations or otherwise prove they are absent from the emitted HTML; CSP must not be widened. Host appearance sets `data-theme` when available, with `prefers-color-scheme` as the initial fallback. Do not use remote host-font loading.

### 3. Prefer the existing bundler, add one small browser pipeline only when needed

First prove whether pinned tsdown can emit the browser JavaScript while Tailwind produces static CSS and a small deterministic step inlines both into one HTML file. If that requires a private bundler or brittle assembly, use the minimum official Vite single-file path instead. Node entry points remain on tsdown.

Browser libraries are bundled build inputs. The tarball contains the generated HTML beside the compiled MCP entry point but excludes uncompiled browser source and tests. Two clean builds must yield the same HTML hash.

### 4. Keep one SDK-owned host lifecycle

Use the SDK-1-compatible MCP Apps React support only after testing callback-before-connect ordering and cleanup. `useApp` 1.7.5 supplies `onAppCreated` before connection and its shipped implementation closes on cleanup, although its declaration comments conflict with that behavior. The implementation must not rely on the ambiguity: a fake-host test proves teardown, or the picker uses one direct `App` effect with explicit close.

Disable automatic resize when using `useApp` and pair it with the separately disposed resize hook. Connect once, block duplicate activation synchronously while `sendMessage` is pending, show concise failure, allow only a later deliberate retry, and ignore stale completion after a new result or unmount. No automatic retry, reconnect, polling, or resend.

The adapter sends exactly `Choose product <id> for <ingredient> instead.` and exposes no proposal or basket tool. Temporary view state stays local and business data comes only from validated tool results.

### 5. Keep one browser-safe contract and verify the packed result

Extract only the picker parser and approved image-origin rule into a browser-safe leaf, reuse Zod, prefer structured content over JSON-text fallback, and create no duplicate DTO hierarchy.

Tests execute the built HTML with a fake local host and cover payload variants, hostile content, action semantics, connection/send failures, replacement, cleanup, theme, offline asset policy, narrow layout, and focus. Package smoke compares the served resource with the generated file rather than a hard-coded obsolete source hash. Preserve the URI for this behavior-compatible migration; a later breaking resource contract uses a new URI.

## Risks / Trade-offs

- [UI package pulls a broad dependency graph] -> Import components through documented per-component exports, inspect emitted JavaScript/CSS, and enforce the resource budget.
- [UI CSS references unused remote fonts] -> Remove them from emitted CSS and fail the artifact check rather than widening CSP.
- [SDK lifecycle documentation conflicts with implementation] -> Test actual cleanup; use one explicit `App` effect if the helper does not meet the contract.
- [Build output is erased, unstable, or omitted] -> Verify build ordering, byte-identical rebuilds, and clean packed-resource loading.
- [React increases parse work] -> Record JavaScript/CSS contributions and twenty local result-to-render samples; investigate any p95 over 250 ms or render-related long task over 100 ms rather than declaring a platform guarantee.
- [Disabled mode could fail on eager artifact loading] -> Keep artifact reading inside the enabled resource path and smoke-test disabled startup.

## Migration Plan

1. Characterize the current resource and establish a behavioral built-artifact test.
2. Prove the minimum deterministic single-file browser build and record exact dependency/license/output evidence.
3. Move parsing and shared rendering while retaining the old resource until parity passes.
4. Add the single host lifecycle, switch the resource loader, and remove the inline document and unpkg origin.
5. Run focused, package, privacy, accessibility, and repository gates; use the existing release workflow for one version decision.
6. Roll back immediately with `NEMLIG_MCP_APPS` or restore the prior release. No data migration is required.
