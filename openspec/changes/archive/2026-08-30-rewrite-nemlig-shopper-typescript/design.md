## Context

See `proposal.md` for motivation and the two capability specs for behavior. The current package is a one-line `uvx` wrapper; the monorepo already supplies Node.js 22, pnpm/Turbo, TypeScript, Commander, Zod, ESLint, and the Node test runner patterns. Upstream `main` is a small Python HTTP client plus CLI, MCP server, and embedded picker HTML. Nemlig's API is unofficial and needs cookies, a bearer token, app timestamps, user identity, and delivery-slot state.

## Goals / Non-Goals

**Goals:**

- Keep one shared implementation behind CLI and MCP so search, authentication, basket formatting, and error behavior cannot drift.
- Make external HTTP/data contracts explicit at their trust boundary and deterministic under mocked tests.
- Preserve the existing human approval workflow without building a second proposal database or approval-token subsystem.

**Non-Goals:**

- A general Nemlig SDK, extensible transport framework, background service, cache, database, or browser automation layer.
- Automatic migration, encryption, or synchronization of credentials beyond retaining the existing local file location and restrictive permissions.

## Decisions

### Use the native Node.js HTTP and filesystem APIs

Use Node 22 `fetch`, `AbortSignal.timeout`, `crypto.randomUUID`, and `node:fs/promises`. Keep a small host-scoped cookie map for Nemlig's response cookies because native fetch does not persist them. Inject the fetch function into the client for tests.

Alternative: add a general HTTP client, cookie jar, and mocking framework. Rejected because the client talks to two fixed hosts, only `nemlig.com` needs cookies, and native APIs plus dependency injection cover the tested contract with less owned surface.

### One client module and thin adapters

Put login/session refresh, search/fallback, product normalization, and raw basket calls in one client module. Keep credential I/O, normalized basket/product types, CLI rendering, MCP registration, and picker HTML in small adjacent modules. Both adapters call the same client and normalization functions.

Alternative: separate domain, repository, service, transport, and adapter layers. Rejected because there is one upstream service and no second implementation.

### Validate only external inputs and responses

Use Zod at CLI/MCP/API response boundaries, while ordinary internal values use TypeScript types. Reject invalid quantities and tolerate absent optional upstream fields with safe defaults.

Alternative: model every upstream response exhaustively. Rejected because the unofficial API is broad and only a narrow observable subset is consumed.

### Reuse established dependencies

Use the monorepo's established Commander version for CLI parsing and add the official MCP TypeScript SDK for stdio tools/resources. Use the smallest Inquirer password prompt package already present in the lock graph for masked interactive login. The picker stays one embedded static HTML resource and uses the MCP Apps browser bridge directly.

Alternative: hand-roll CLI/MCP protocols or a hidden terminal prompt. Rejected because protocol correctness and secret-safe terminal behavior are not useful custom code.

### Keep approval in the existing orchestration contract

Search and cart viewing remain read-only. The CLI exposes upstream-compatible mutation commands, while `AGENTS.md` and the Nemlig skill require the exact proposal and user approval before invocation. The picker add button is a direct user choice of the displayed product. Every mutation adapter immediately reads back and returns/displays the basket; it stops after partial success or mismatch.

Alternative: persist signed approval envelopes. Rejected because no autonomous batch executor exists and the requested parity surface is single-command interaction; introduce envelopes only if unattended or resumable mutations are later requested.

### Preserve upstream entry points but remove recipe surfaces

Package binaries/scripts expose `nemlig`, `nemlig-shopper`, and `nemlig-mcp`. CLI has `login`, `logout`, `search`, `add`, and `cart`; MCP has search/add/view/clear plus optional picker. No recipe module, command, tool, dependency, or documentation is carried over.

## Risks / Trade-offs

- [Nemlig changes its unofficial API, headers, or cookies] → Isolate constants and parsing in the client, retain sanitized diagnostics, and keep fixture contract tests small enough to update from read-only evidence.
- [The minimal cookie handling stops covering Nemlig's responses] → Test multiple `Set-Cookie` values and replace it with a standards-complete cookie dependency only when a captured response demonstrates the need.
- [A mutation succeeds but readback fails] → Report partial success explicitly and stop; never retry a mutation automatically.
- [CLI parity could be mistaken for mutation authorization] → Keep the app instructions and skill explicit that code availability and planning never authorize a basket change.
- [Remote upstream evolves after planning] → Pin implementation evidence to the upstream `main` SHA recorded when apply begins and treat later upstream changes as a separate parity update.

## Migration Plan

1. At apply start, record the current upstream `main` SHA and re-check its non-recipe command/tool surface.
2. Replace the wrapper with local source, configuration, tests, and package entry points; update the local instructions and skill in the same change.
3. Remove `uvx` and recipe references, regenerate the workspace lockfile, and run focused package checks followed by root `pnpm verify` and strict OpenSpec validation.
4. Use only mocked/synthetic HTTP fixtures for automated verification. Optional live verification is read-only search/cart inspection and requires the user to perform interactive login.
5. Roll back by reverting the implementation commit; saved credentials remain local and untouched unless the user explicitly runs logout.
