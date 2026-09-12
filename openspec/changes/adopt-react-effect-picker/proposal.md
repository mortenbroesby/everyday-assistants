## Why

The optional Nemlig product picker is currently a large inline HTML string that loads executable JavaScript from a public CDN, which makes the UI harder to evolve and ties availability to an external origin. The picker is a bounded place to establish the long-term React and functional-programming direction without rewriting the safety-critical proposal and basket flows.

## What Changes

- Build the existing picker as one locally bundled, self-contained HTML resource rendered by React while preserving its current user-visible behavior, accessibility, feature gate, and conversational fallback.
- Use stable Effect 3 for one narrow browser boundary: MCP host connection, result subscription, and single-send choice-message lifecycle. Do not convert server orchestration or basket proposal/application logic in this change.
- Remove executable CDN loading from the picker and tighten its resource CSP to the minimum origins still required for approved product images.
- Validate the built picker artifact, hostile-data handling, host lifecycle, duplicate-action prevention, package contents, and bundle-size impact without Nemlig credentials or network access.
- Keep the existing `@modelcontextprotocol/ext-apps` protocol line unless implementation evidence requires a separately reviewed compatibility change.

### Goal

Deliver a maintainable React picker and a demonstrably useful, bounded Effect production foothold while preserving all Nemlig safety and distribution contracts.

### Non-goals

- No server-wide functional rewrite, Effect 4 release candidate, React framework, router, design system, global state library, compiler, provider change, or new service.
- No changes to proposal semantics, approval requirements, basket mutation tools, automatic retries, checkout, ordering, payment, or deployment authority.
- No reorganization of agent instructions, skills, or Copilot agents in this pull request.

### Acceptance criteria

- The built MCP Apps resource is self-contained, contains no executable CDN dependency, and preserves picker behavior plus conversational fallback.
- React owns rendering; Effect owns only the documented host-session lifecycle, with at most one outgoing choice message per user activation.
- Focused artifact, lifecycle, security, package, and bundle-size checks pass, followed by the repository verification gate.
- The implementation is delivered on `codex/adopt-react-effect` in one follow-up pull request for this epic.

### Follow-up

After this React/Effect change is merged, create a separate pull request that reduces agentic artifacts to a small core instruction set with explicit task routing for specialized instructions, skills, OpenSpec guidance, and GitHub Copilot agents. That follow-up must define both positive and negative routing rules so agents load a specialized artifact only when its trigger applies, rather than invoking skills speculatively.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require the optional picker to be a locally bundled interactive resource with bounded host lifecycle behavior and no executable CDN dependency.
- `nemlig-package-distribution`: Require the packed package to contain and serve the built picker artifact without repository source files or undeclared runtime imports.

## Impact

- Affects the picker source/build path, `apps/nemlig-assistant/src/mcp.ts`, picker-focused interface tests, package validation, and the Nemlig package manifest and lockfile during implementation.
- Adds React, React DOM, stable Effect 3, and the MCP Apps client as explicit application dependencies, plus only the minimum build tooling needed to emit one self-contained HTML file.
- Adds browser bytes and parse work but no service, storage, polling, retry amplification, provider request, or recurring operating cost. Implementation must measure the artifact delta before adoption.
- Preserves `NEMLIG_MCP_APPS` as the immediate picker kill switch and preserves the prior release as the rollback path.
