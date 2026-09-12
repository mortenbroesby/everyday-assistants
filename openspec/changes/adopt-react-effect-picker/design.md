## Context

See [proposal.md](proposal.md) for motivation. Today `src/mcp.ts` contains the complete minified picker document, loads `@modelcontextprotocol/ext-apps` from unpkg, and serves it behind `NEMLIG_MCP_APPS`. The same server also owns safety-critical proposal and basket operations; those paths already have explicit approval, retry, and mutation invariants that this UI migration must not disturb.

The package builds three Node ESM entry points with tsdown and has no browser build. Its clean-install and tarball checks must continue to work on Node 22.23.1 without credentials or Nemlig access. The delta specs define the observable resource, lifecycle, and packaging requirements.

## Goals / Non-Goals

**Goals:**

- Establish React for the one existing interactive surface and stable Effect 3 for one real asynchronous lifetime.
- Produce one auditable HTML artifact that works from the packed package with no executable CDN dependency.
- Keep data normalization pure, rendering local, and host effects at a thin boundary.
- Make success and rollback measurable before widening either library's use.

**Non-Goals:**

- No generic frontend platform, shared component system, router, global store, framework, or additional MCP App abstraction.
- No Effect conversion of `runMcpOperation`, authentication retry, proposal preparation/application, or server entry points.
- No protocol-package upgrade bundled into the migration unless the current line cannot meet the verified host contract.

## Decisions

### 1. One React root replaces the inline DOM program

Create a small picker entry point with one React root. Components receive plain validated data and use native controls, existing CSS variables, and local React state. Product text is rendered as text, approved images retain lazy loading, `no-referrer`, useful alt text, and broken-image removal, and no path uses `dangerouslySetInnerHTML`.

React is warranted here because the picker already has multiple conditional result states, repeated cards, local action state, and lifecycle-driven updates. Plain DOM code remains the fallback for pages without interactive UI; no repository-wide React convention is implied.

Alternatives considered:

- Keep the inline DOM string: fewer dependencies, but preserves the external executable dependency and the least maintainable part of the current surface.
- Adopt a React framework or design system: rejected because this is one sandboxed resource with no routing, server rendering, or shared design-system need.

### 2. Vite emits one self-contained HTML file

Add an isolated Vite build using the React plugin and `vite-plugin-singlefile`, following the MCP Apps single-resource pattern. The Node build remains on tsdown. The server reads the generated HTML beside its compiled entry point and returns it through the existing resource URI and MIME type. Browser libraries and build tools stay build-time package dependencies because the installed server consumes only the bundled artifact; the tarball must contain no unresolved browser import.

This adds tooling but avoids custom HTML assembly or teaching the Node bundler a second target. The implementation pins exact tested versions and runs the picker build before package and interface checks.

Alternatives considered:

- Extend tsdown and write custom HTML/CSS inlining: rejected unless a focused spike proves it can emit the complete artifact with less configuration and no custom post-processing.
- Ship separate JavaScript and CSS assets: rejected because MCP Apps clients consume the existing single resource and additional resource loading expands packaging and CSP surface.

### 3. Effect owns only the host-session lifetime

Use stable Effect 3 in one browser adapter that constructs the existing MCP Apps `App`, registers result callbacks before connection, connects once, sends deliberate choice messages, and closes or invalidates the session on unmount. React observes adapter state; it does not create a second connection through `useApp`.

Each user activation creates at most one send effect. Pending state blocks duplicate activation. Failure becomes inert view state and permits a later deliberate retry; the adapter never automatically retries, reconnects, polls, or resends. A generation token or equivalent scoped cancellation guard prevents stale completion from updating a replacement or unmounted view. Interruption is cleanup, not undo.

This is the smallest current boundary where Effect's scoped lifetime, typed failure channel, and cancellation semantics are useful together. The small server wrappers are intentionally left alone because converting them would add ceremony without reducing branching or risk.

Alternatives considered:

- Effect throughout the server: rejected due to broad safety-sensitive blast radius and weak present evidence.
- Add Effect but leave it unused or use it for one promise: rejected because it would not test a meaningful long-term adoption pattern.
- Use both the React `useApp` hook and an Effect connection service: rejected because two lifecycle owners invite duplicate connections and handlers.

### 4. Keep one small browser-safe contract boundary

Extract only the picker payload parsing and approved image-origin rule into a browser-safe leaf module that neither imports `mcp.ts` nor performs effects. Reuse the repository's Zod dependency where runtime validation is needed, infer TypeScript types from that contract, and keep the existing structured-content-first plus JSON-text fallback. Do not introduce Effect Schema, a duplicate DTO hierarchy, service interfaces, factories, or a component library.

The pure boundary converts untrusted host results to the minimal picker view model. React components and the host adapter consume that result; malformed content becomes the current empty or rejected state rather than an exception or injected markup.

### 5. Preserve protocol, safety, and rollback boundaries

Keep the current `@modelcontextprotocol/ext-apps` 0.4 protocol line for the first migration. Remove unpkg from the resource CSP and retain only approved image origins. The picker continues to send a conversational choice message and never invokes a basket mutation tool. All proposal approval, fresh authentication, quotas, mutation retry rules, and tool registration remain unchanged.

`NEMLIG_MCP_APPS` remains the immediate kill switch. The previous package release remains the code rollback. No new provider, service, storage, analytics, background work, or deployment permission is introduced.

### 6. Verify the built boundary, not source strings

Focused checks load the emitted HTML in the existing test environment with a fake MCP host. They cover structured results, JSON-text fallback, empty and rejected states, hostile strings and image URLs, one-send behavior, send failure, duplicate clicks, result replacement, and mount/unmount during connection. Package smoke reads the resource from a clean tarball installation. Existing conversational and proposal tests remain unchanged.

Record raw and gzip picker sizes before and after the migration. The implementation may accept a larger artifact only when it remains within tested MCP host limits and the pull request reports the measured browser parse/download trade-off; otherwise stop and reduce or reject the dependency set.

## Risks / Trade-offs

- [React and Effect increase resource bytes and browser parse work] → Measure raw and gzip artifacts, avoid optional packages, and keep only one UI entry point.
- [Two lifecycle owners can duplicate host connections or messages] → The Effect adapter exclusively owns `App`; React only renders adapter state.
- [Bundling can hide a bare import or omit the HTML from the tarball] → Test the emitted file and launch/read it from a clean packed installation.
- [Functional adoption spreads into safety-critical server code without evidence] → Limit this change to the named browser boundary; require a separate evidence-backed proposal for later expansion.
- [A dependency upgrade changes MCP host behavior] → Preserve the current protocol line and treat any forced upgrade as an explicit compatibility checkpoint.
- [Sibling release work changes the package version or lockfile first] → Rebase the implementation phase on current `origin/main` after that pull request and regenerate dependency changes once.

## Migration Plan

1. Rebase this epic branch on current `origin/main` after the active release-workflow pull request lands; confirm no picker-path overlap before implementation.
2. Characterize the current built resource behavior and record baseline raw/gzip size.
3. Prove the isolated single-file build and packed-resource path with the minimum dependency set. Stop if it cannot produce a complete artifact without runtime network imports.
4. Move parsing, rendering, and host lifetime in separate verified slices while leaving the old picker available until parity checks pass.
5. Switch the resource loader, remove the inline document and unpkg CSP origin, run focused, package, privacy, and full repository gates, then advance the package version through the existing release plan.
6. Roll back by disabling `NEMLIG_MCP_APPS` immediately or restoring the prior package release; no data migration is required.

## Open Questions

- The exact acceptable resource-size ceiling depends on verified limits of the supported MCP Apps hosts; implementation records those limits and selects the lowest confirmed ceiling before switching the resource.
