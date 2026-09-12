## Why

The optional Nemlig product picker now proves that React and OpenAI Apps SDK UI can preserve the existing reviewed-proposal workflow, but its MVP browser build still hand-assembles HTML, rewrites generated CSS, and bypasses the SDK's host-style integration. That is not a maintainable long-term foundation for the user-visible Nemlig interactions the user intends to add.

OpenAI's published examples use React, Tailwind, Vite, and MCP Apps host hooks. Productionizing that supported path removes the brittle build workaround, fixes incorrect host design-token names, and establishes one small reusable presentation foundation without inventing a second design system.

## What Changes

- Keep tsdown for the Node MCP/package entry points and use a pinned Vite/Tailwind/single-file browser build for the self-contained picker resource.
- Delete the emitted-CSS regex rewrite and hand-built HTML assembly; verify the generated artifact instead of mutating it after the supported browser build.
- Use the documented Apps SDK UI stylesheet, components, host-style hook, host fonts, theme variables, and safe-area context with resilient system fallbacks.
- Extract only the shared visual root and pure reviewed-proposal view needed by both the production picker and a synthetic local design showcase.
- Use the foundation for future Nemlig visual interactions: first show the intended states in the local showcase, then reuse the same presentation code in the production host container.
- Preserve the exact alternative-choice message, default-on feature gate, conversational fallback, safety controls, deterministic package, and immediate UI rollback.
- Verify, merge through protected `main`, deploy the exact merged revision through the protected production workflow, and perform read-only acceptance without basket mutation.

### Goal

Ship a production-ready, self-contained Nemlig Apps SDK UI foundation whose supported build, host integration, and reusable reviewed-proposal design are easier to operate and change safely than the MVP.

### Non-goals

- No FP runtime dependency; `adopt-effect-picker-lifecycle` owns the functional-TypeScript comparison.
- No editable quantities, new shopping workflow, proposal application, basket tool call, server orchestration conversion, authentication change, protocol-major upgrade, router, global store, generic component registry, new service, or provider scaling change.
- No speculative widgets beyond the states already required by the reviewed-proposal picker and its synthetic design showcase.
- No agent-instruction or skills reorganization in this pull request; the sibling agent-artifact change remains separately reviewable and will rebase after this merge.

### Acceptance criteria

- Node builds remain on tsdown while a documented Vite/Tailwind/single-file pipeline emits `dist/picker.html` without custom emitted-CSS rewriting or hand-built HTML interpolation.
- The production picker and local synthetic showcase share one payload-driven presentation implementation and foundational stylesheet; the showcase is absent from the packed production package and makes no Nemlig calls.
- One SDK host owner applies initial and live host theme, variables, fonts, and safe-area context with correct published token names and graceful operating-system/system-font fallback.
- The artifact embeds executable code and application styling; it contains no external application script, stylesheet, dynamic JavaScript chunk, or API fetch. Product images remain limited to the two approved Nemlig HTTPS origins, and optional official OpenAI font references are limited to `https://cdn.openai.com` and fail safely when blocked or offline.
- The complete HTML is at most 1,500,000 raw bytes and 350,000 gzip bytes. These decimal-byte budgets are project choices, not claimed OpenAI limits.
- One alternative activation sends `Choose product <id> for <ingredient> instead.` at most once while pending, handles failure without automatic retry, ignores stale completion, and never prepares or applies a proposal or mutates the basket.
- Keyboard behavior, visible focus, 44 px targets, WCAG AA contrast, 320 px layout, 200% text zoom, reduced motion, light/dark switching, and offline font/image fallback are verified against the emitted artifact.
- Two clean builds produce identical HTML, a clean tarball serves that exact artifact, required checks pass on the branch and merged revision, and the deployed revision passes sequential read-only acceptance.

### Follow-ups

1. Rebase and retarget `adopt-effect-picker-lifecycle` after this UI foundation merges, using its behavior tests as the comparison invariant.
2. Rebase the separately scoped agent-artifact routing pull request after this merge; it remains responsible for explicit positive and negative routing rules for instructions, skills, OpenSpec, and GitHub Copilot agents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require the optional picker and future Nemlig visual interactions to use the reusable, locally bundled Apps SDK UI foundation while preserving safe reviewed-proposal presentation, deliberate choice messaging, lifecycle, gate, and fallback contracts.
- `nemlig-package-distribution`: Require the packed package to contain and serve the deterministic production picker while excluding showcase/source/test material and external executable dependencies.

## Impact

- Affects the Nemlig browser UI source/build path, host lifecycle, picker-focused tests, `src/mcp.ts` resource policy, package validation, manifest, lockfile, dependency documentation, release, merge, and protected deployment evidence.
- Adds pinned Vite, React plugin, Tailwind Vite plugin, and single-file plugin build inputs; removes the Tailwind CLI and experimental tsdown CSS plugin. React, Apps SDK UI, ext-apps, Tailwind, and Node tsdown versions otherwise remain unchanged.
- Optional browser font downloads can add client bandwidth but add no service, storage, polling, retry amplification, provider request, recurring operator cost, or basket mutation. Existing quotas, kill switches, and fail-closed behavior remain unchanged.
- Preserves `NEMLIG_MCP_APPS` as the immediate UI kill switch and the previous deployed release as the code rollback.
