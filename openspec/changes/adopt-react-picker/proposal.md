## Why

The optional Nemlig product picker is a large inline HTML string that loads executable JavaScript from a public CDN. It needs a self-contained package and a maintainable renderer, but those are separate decisions: native TypeScript, React, or Preact can all be bundled locally.

Current OpenAI guidance uses React for component UIs and offers an optional React/Tailwind design system, while MCP Apps also documents vanilla and Preact implementations. React is the preferred long-term renderer for this repository, subject to one equal built-artifact comparison before the switch.

## What Changes

- Bundle the existing picker into one self-contained HTML resource with no executable network dependency.
- Compare bundled native TypeScript, React, and Preact under the same production settings; adopt React when it preserves behavior and stays within the recorded project size/performance budget, otherwise retain the smallest passing option.
- Preserve reviewed-proposal presentation, accessibility, approved product images, the exact alternative-choice chat message, the default-on feature gate, and conversational fallback.
- Use native CSS, host theme variables, system fonts, and native controls initially. Defer Tailwind and `@openai/apps-sdk-ui` until repeated styled components or a complex accessible interaction demonstrates their value.
- Use the smallest native MCP Apps host integration needed for connection, results, cleanup, and one deliberate message send; functional payload normalization remains part of this change, but an FP runtime dependency is not.
- Validate the emitted HTML, hostile-data handling, lifecycle behavior, package contents, accessibility, and raw/gzip size without Nemlig credentials or network access.

### Goal

Ship an independently usable, locally bundled picker with a justified long-term UI stack while preserving all current Nemlig behavior and safety contracts.

### Non-goals

- No FP runtime dependency; the stacked functional-TypeScript comparison owns that decision.
- No editable quantities, new selection workflow, basket tool call, server orchestration change, protocol-major upgrade, router, global state library, compiler, service, or provider change.
- No Tailwind or component-library adoption without a concrete component/style benefit and measured emitted-CSS cost.
- No reorganization of agent instructions, skills, or Copilot agents in this pull request.

### Acceptance criteria

- One representative native, React, and Preact build uses the same payload, SDK cohort, CSS, production settings, and behavioral assertions; the framework decision and raw/gzip output are recorded before switching.
- The built MCP Apps resource is self-contained and preserves the existing URI, MIME type, picker behavior, feature gate, and conversational fallback.
- One alternative activation sends `Choose product <id> for <ingredient> instead.` at most once and never mutates the basket.
- The selected UI passes focused built-artifact, lifecycle, security, package, keyboard, contrast, text-resizing, narrow-viewport, and theme checks, followed by the repository verification gate.
- The picker can ship and roll back independently of the functional-programming follow-up.

### Follow-ups

1. Stack `adopt-effect-picker-lifecycle` on this draft to compare functional TypeScript options across the pure picker core and MCP Apps lifecycle before selecting one coherent dependency model.
2. After both adoption tracks are merged or explicitly resolved, create a separate pull request that reduces agentic artifacts to a small core with positive and negative task-routing rules for instructions, skills, OpenSpec guidance, and GitHub Copilot agents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require the optional picker to be a locally bundled resource that preserves presentation, safe rendering, deliberate choice messaging, lifecycle behavior, gate, and fallback contracts.
- `nemlig-package-distribution`: Require the packed package to contain and serve the built picker without repository source files or unresolved browser imports.

## Impact

- Affects only the picker source/build path, browser-safe payload boundary, `apps/nemlig-assistant/src/mcp.ts`, picker-focused tests, package validation, manifest, and lockfile during implementation.
- React is preferred; Preact and bundled native TypeScript are bounded comparison candidates. The compatible MCP Apps client is a build input. Tailwind and OpenAI Apps SDK UI are deferred.
- Adds browser bytes and parse work but no service, storage, polling, retry amplification, provider request, recurring operating cost, or basket mutation.
- Preserves `NEMLIG_MCP_APPS` as the immediate kill switch and the previous release as the code rollback.
