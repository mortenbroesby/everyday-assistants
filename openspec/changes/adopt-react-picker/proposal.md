## Why

The optional Nemlig product picker is a large inline HTML string that loads executable JavaScript from a public CDN. Moving this one existing interactive surface to a locally bundled React resource makes it independently maintainable and removes the executable network dependency without changing the basket-safety model.

## What Changes

- Build the current picker as one self-contained HTML resource rendered by React.
- Preserve reviewed-proposal presentation, accessibility, approved product images, the exact alternative-choice chat message, the default-on feature gate, and the conversational fallback.
- Use the smallest native MCP Apps host integration needed for connection, results, cleanup, and one deliberate message send; Effect is explicitly excluded from this change.
- Validate the emitted HTML, hostile-data handling, lifecycle behavior, package contents, and raw/gzip size without Nemlig credentials or network access.
- Remove executable CDN loading and remove unpkg from the resource policy after the local bundle is verified.

### Goal

Ship an independently usable React picker that preserves all current Nemlig behavior and safety contracts while requiring no executable CDN.

### Non-goals

- No Effect dependency or functional host adapter; that is a separate stacked change.
- No editable quantities, new selection workflow, basket tool call, server orchestration change, protocol upgrade without demonstrated necessity, framework, router, design system, global state library, compiler, service, or provider change.
- No reorganization of agent instructions, skills, or Copilot agents in this pull request.

### Acceptance criteria

- The built MCP Apps resource is self-contained and preserves the existing URI, MIME type, picker behavior, feature gate, and conversational fallback.
- One alternative activation sends the existing `Choose product <id> for <ingredient> instead.` message at most once and never mutates the basket.
- Focused built-artifact, lifecycle, security, package, and bundle-size checks pass, followed by the repository verification gate.
- React can ship and roll back independently of the Effect follow-up.

### Follow-ups

1. Stack `adopt-effect-picker-lifecycle` on the React draft to compare and, only with evidence, replace the native host-lifecycle implementation with stable Effect 3.
2. After the React and Effect tracks are merged or explicitly resolved, create a separate pull request that reduces agentic artifacts to a small core with positive and negative task-routing rules for instructions, skills, OpenSpec guidance, and GitHub Copilot agents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require the optional picker to be a locally bundled React resource that preserves presentation, safe rendering, deliberate choice messaging, lifecycle behavior, gate, and fallback contracts.
- `nemlig-package-distribution`: Require the packed package to contain and serve the built picker without repository source files or unresolved browser imports.

## Impact

- Affects only the picker source/build path, its browser-safe payload boundary, `apps/nemlig-assistant/src/mcp.ts`, picker-focused tests, package validation, manifest, and lockfile during implementation.
- Adds React, React DOM, and the existing MCP Apps client as explicit build inputs plus only the minimum tooling needed to emit one self-contained HTML file.
- Adds browser bytes and parse work but no service, storage, polling, retry amplification, provider request, recurring operating cost, or basket mutation.
- Preserves `NEMLIG_MCP_APPS` as the immediate kill switch and the previous release as the code rollback.
