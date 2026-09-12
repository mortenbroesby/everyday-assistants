## Why

The optional Nemlig product picker is a large inline HTML string that loads executable JavaScript from a public CDN. The user wants a maintainable, long-lived ChatGPT app UI that follows OpenAI's published component guidance, not a framework choice optimized only for the smallest byte count.

OpenAI Apps SDK UI supplies accessible React components and Tailwind design tokens for this purpose. A bounded MVP can prove that stack against the picker's real packaging, lifecycle, accessibility, and safety constraints before it becomes a wider repository convention.

## What Changes

- Replace the inline DOM renderer with a locally bundled React 19 picker using Tailwind 4 and selected `@openai/apps-sdk-ui` components.
- Use the UI kit for shared interactive/status styling and keep semantic native elements for articles, disclosures, and images; do not create a local design-system clone.
- Keep the MCP Apps host bridge separate from the UI design system and use one SDK-owned React lifecycle with explicit duplicate-send and stale-completion guards.
- Preserve reviewed-proposal presentation, approved product images, the exact alternative-choice chat message, the default-on feature gate, and conversational fallback.
- Validate the emitted HTML rather than source spellings, including offline execution and styling, hostile-data handling, lifecycle behavior, accessibility, deterministic package contents, and measured raw/gzip size.
- Remove the executable CDN and do not widen CSP for fonts or other UI-library assets.

### Goal

Ship an independently usable, self-contained Nemlig picker whose React and OpenAI Apps SDK UI implementation is easier to change safely than the current imperative inline document.

### Non-goals

- No FP runtime dependency; the stacked functional-TypeScript comparison owns that decision.
- No editable quantities, new selection workflow, basket tool call, server orchestration change, protocol-major upgrade, router, global state library, compiler, service, provider, or production mutation.
- No repository-wide React, Tailwind, or Apps SDK UI mandate based on this one MVP.
- No reorganization of agent instructions, skills, or Copilot agents in this pull request.

### Acceptance criteria

- The picker has one payload validator, one host-session owner, and one shared product-card implementation; changing common card presentation does not require separate proposed/alternative renderers.
- The built resource makes zero executable, stylesheet, or font requests. Optional images remain limited to the two approved Nemlig HTTPS origins, and unpkg is removed from CSP.
- The complete self-contained HTML is at most 1.5 MiB raw and 350 KiB gzip. These are project budgets, not claimed OpenAI limits; actual JavaScript, CSS, and package footprints are recorded separately.
- One alternative activation sends `Choose product <id> for <ingredient> instead.` at most once while pending, handles failure without automatic retry, ignores stale completion, and never prepares or applies a proposal or mutates the basket.
- Keyboard disclosure/action behavior, visible focus, at least 44 px enabled action targets, WCAG AA text contrast, 320 px layout, 200% text zoom, reduced motion, and host light/dark switching are verified against the emitted artifact.
- Two clean builds produce identical HTML, and a clean tarball installation serves that exact artifact without source files, unresolved imports, or credentials.
- Focused built-artifact, lifecycle, safety, package, privacy, and repository verification gates pass.

### Follow-ups

1. Stack `adopt-effect-picker-lifecycle` on this draft to compare functional TypeScript options across the pure picker core and MCP Apps lifecycle before selecting one coherent dependency model.
2. After both adoption tracks are merged or explicitly resolved, create a separate pull request that reduces agentic artifacts to a small core with positive and negative task-routing rules for instructions, skills, OpenSpec guidance, and GitHub Copilot agents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require the optional picker to be a locally bundled React and Apps SDK UI resource that preserves presentation, safe rendering, deliberate choice messaging, lifecycle behavior, gate, and fallback contracts.
- `nemlig-package-distribution`: Require the packed package to contain and serve the deterministic built picker without repository source files, unresolved browser imports, or remote executable/style/font dependencies.

## Impact

- Affects only the picker source/build path, browser-safe payload boundary, `apps/nemlig-assistant/src/mcp.ts`, picker-focused tests, package validation, manifest, lockfile, and dependency documentation during implementation.
- React, React DOM, Tailwind, OpenAI Apps SDK UI, and an SDK-1-compatible MCP Apps client become browser build inputs. A minimal single-file build tool may be added only if existing tsdown cannot produce the required artifact cleanly.
- Adds browser bytes and parse work but no service, storage, polling, retry amplification, provider request, recurring operating cost, or basket mutation.
- Preserves `NEMLIG_MCP_APPS` as the immediate UI kill switch and the previous release as the code rollback.
