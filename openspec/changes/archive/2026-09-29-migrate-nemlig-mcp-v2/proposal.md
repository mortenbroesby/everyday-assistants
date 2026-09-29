## Why

The hosted MCP path currently couples protocol sessions to application-owned server and transport maps, so standard stateless HTTP serving and request-independent server creation are not available. The chosen v2 SDK path removes that transport coupling while preserving authenticated, principal-scoped shopping state and write safeguards.

## What Changes

- Move owned MCP server/client code to a mutually compatible, published stable v2 package set and use the SDK's standard modern-only stateless HTTP handler on the existing `/mcp` route.
- Remove application-owned protocol session tracking and initialize-only server construction; keep authenticated application context outside each fresh request-scoped MCP server.
- Target only the modern `2026-07-28` protocol; older protocol compatibility and legacy-client tests are out of scope.
- Specify that an approved basket review remains usable on a later HTTP request only for its authenticated principal and only while all existing freshness, expiry, replay, and uncertainty checks pass.
- Keep authentication, bounded admission, provider access, product behavior, and the staged basket-write boundary in force on every request.

Non-goals: redesigning product search or presentation under #93, changing the provider or hosting topology, introducing new endpoints or durable review storage, or performing real basket operations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: define the v2 server factory and request-independent HTTP serving contract while retaining stdio and existing tool semantics.
- `nemlig-cloudflare-hosting`: replace required HTTP protocol sessions with one stateless handler without weakening authentication or bounded admission.
- `nemlig-basket-proposals`: define safe principal-scoped review continuity across separate HTTP requests.

## Impact

This migration is integrated with issue #93's rich product search and shared viewer on the dedicated branch `codex/issue-93-rich-search-viewer` and its single shared PR #95. The combined epic affects the Nemlig SDK dependencies and lockfile, MCP server/client call sites, HTTP lifecycle, Worker/gateway protocol handling, product presentation, tests, and the listed OpenSpec capabilities from both issues. The PR covers implementation and synthetic verification; any hosted rollout remains subject to the repository's deployment gate and explicit approval.
