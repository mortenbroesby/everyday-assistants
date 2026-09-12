## Context

See [proposal.md](proposal.md) for motivation. `src/mcp.ts` currently embeds the complete minified picker, imports the MCP Apps client from unpkg, and serves the document behind `NEMLIG_MCP_APPS`. The picker displays an already reviewed proposal and can send one exact alternative-choice message back to chat; quantity is display-only. It does not prepare or apply basket changes.

The package builds three Node ESM entry points with tsdown and has no browser build. The clean-install and tarball checks must continue to work on Node 22.23.1 without credentials or Nemlig access. The separate Effect draft depends on this React boundary and must not be required for React to ship.

## Goals / Non-Goals

**Goals:**

- Replace only the existing picker rendering with one self-contained React root.
- Keep payload normalization pure and host effects in one minimal native adapter.
- Preserve current behavior, accessibility, packaging, and safety before any Effect experiment.

**Non-Goals:**

- No new picker feature, editable quantity, basket call, shared component system, router, global store, framework, or generic host-service abstraction.
- No Effect code, server orchestration conversion, authentication change, or proposal/application change.

## Decisions

### 1. One React root renders the existing view

Components receive plain validated data and use native controls, existing CSS variables, and local state. Preserve loading, empty, malformed, rejected, favorite, pantry, confidence, proposed-product, alternative, price, description, availability, and details behavior. Product text is rendered as text; approved images keep alt text, lazy loading, `no-referrer`, and broken-image fallback. No path uses `dangerouslySetInnerHTML`.

React is justified by the existing conditional result states, repeated cards, and lifecycle-driven updates. No repository-wide frontend platform is introduced.

Alternative: retain the inline DOM program. This avoids React bytes but keeps the executable CDN and the least maintainable part of the current UI.

### 2. Prefer the existing bundler, add only proven tooling

First prove whether the pinned tsdown toolchain can emit the browser code needed for one deterministic HTML file without custom post-processing. If it cannot, use an isolated Vite single-file build; add the React plugin only if the verified configuration requires it. The Node entry points remain on tsdown.

The server reads the generated HTML beside its compiled entry point and returns it through the existing URI and MIME type. React, React DOM, and the MCP Apps client are build-time package dependencies because the installed Node process consumes only the bundled artifact. The tarball contains no bare browser import or uncompiled browser source.

Alternatives: separate JavaScript/CSS resources expand packaging and resource-policy surface; custom HTML assembly is accepted only if it is smaller than adding a proven single-file plugin and remains deterministic.

### 3. React ships with one native host-lifecycle owner

Use the existing MCP Apps `App` directly. Register result handling before connecting, connect once per mount, block duplicate activation while `sendMessage` is pending, show a concise send failure, permit only a later deliberate retry, and dispose or invalidate callbacks on unmount. Cleanup prevents stale completion from updating a newer or unmounted view. There is no automatic retry, reconnect, polling, or resend.

The adapter preserves the exact `Choose product <id> for <ingredient> instead.` message. It exposes no proposal-apply or basket tool. It stays small enough for the stacked Effect change to compare against and replace without changing React components or behavior tests.

Alternative: make React depend on Effect immediately. Rejected because the split requires React to be independently reviewable, shippable, and reversible.

### 4. Keep one browser-safe contract boundary

Extract only the picker payload parser and approved image-origin rule into a browser-safe leaf module. Reuse Zod where runtime validation is needed, infer types from that contract, and keep structured content ahead of JSON-text fallback. Do not introduce a second DTO hierarchy, service interface, factory, or component library.

### 5. Verify the emitted and packed resource

Focused checks load the built HTML with a fake local MCP host. Cover structured and text results, empty and rejected states, hostile strings and URLs, exact message success/failure, duplicate activation, result replacement, connection failure, and mount/unmount cleanup. Package smoke reads the resource from a clean tarball installation.

Record raw and gzip sizes before and after. Select the lowest verified supported-host ceiling before switching; stop rather than invent a limit or ship an artifact that exceeds it. Remove unpkg from `resourceDomains` only after the artifact contains no executable network load, leaving only approved Nemlig product-resource origins.

## Risks / Trade-offs

- [React increases resource bytes and parse work] → Measure the emitted artifact, omit optional packages, and keep one entry point.
- [Build output is erased or omitted] → Verify build ordering and read the resource from a clean packed installation.
- [Lifecycle cleanup changes message behavior] → Characterize the existing exact message first and run the same fake-host scenarios against the built resource.
- [The Effect draft creates a second owner] → React exposes one replaceable native adapter; Effect may replace it but may not coexist with it.
- [Concurrent release work changed the manifest or lockfile] → Start implementation from merged `origin/main` and regenerate dependency changes once.

## Migration Plan

1. Characterize the existing served picker and record its raw/gzip size.
2. Prove the minimum single-file build and clean packed-resource path.
3. Move parsing and rendering while retaining the old resource until built-artifact parity passes.
4. Add the native single-owner host adapter, switch the resource loader, and remove the inline document and unpkg origin.
5. Run focused, package, privacy, and full repository gates; then use the existing release workflow for one version decision.
6. Roll back immediately with `NEMLIG_MCP_APPS` or restore the prior release. No data migration is required.

## Open Questions

- Whether pinned tsdown alone or a Vite single-file build is the smaller verified path is resolved by the first build proof; it does not change the resource contract or later task order.
