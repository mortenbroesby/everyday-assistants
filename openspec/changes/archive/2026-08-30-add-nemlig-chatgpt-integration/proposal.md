## Why

After PR #8 is merged, the Nemlig shopper will already have a local CLI and stdio MCP server with local credential storage. The missing step is to make that server usable directly from normal ChatGPT conversations without requiring Codex.

The first version has a much narrower trust boundary than originally assumed:

- The household currently uses one ChatGPT account.
- The integration is private and is created in ChatGPT Developer mode.
- ChatGPT reaches the local stdio MCP server through Secure MCP Tunnel.
- The local computer, MCP server, and tunnel client may need to remain running.
- Nemlig credentials remain on the local computer.
- Public distribution and always-on hosting are not current requirements.

Within that boundary, a separate Auth0 tenant, app-level OAuth flow, user allowlist, subject-to-account mapping, hosted credential store, and multi-user session isolation would add complexity without solving a current problem. The tunnel control plane and the single associated ChatGPT account form the access boundary for this private version. If that boundary expands later, OAuth and hosted isolation must be designed in a separate change before expansion.

This change assumes draft PR #8, feat: rebuild Nemlig shopper in TypeScript, is complete, merged, and archived before implementation begins.

## What Changes

- Preserve the post-PR #8 CLI and local stdio MCP server.
- Add authenticated, read-only favorites lookup to the shared client, CLI, and MCP server so the first live proof can use a real favorite.
- Add deliberate exact-line removal to the shared client and local CLI, then expose it to ChatGPT only through the same proposal safety contract as other basket writes.
- Make the stdio server compatible with a private ChatGPT Developer mode app reached through Secure MCP Tunnel.
- Ensure product search, basket inspection, proposal review, and approved basket changes work in normal ChatGPT Chat and Work without Codex.
- Keep Codex support as an optional client, not a runtime dependency.
- Replace model-visible direct basket mutations with short-lived exact proposals that are revalidated before one-time application.
- Add complete MCP schemas, concise tool descriptions, safe results, and accurate read-only, open-world, and destructive annotations.
- Keep the optional picker aligned with the same prepare, review, approve, apply, and verify workflow.
- Add a reproducible local tunnel runbook and ChatGPT golden prompt suite.
- Keep all Nemlig credentials, tunnel runtime credentials, cookies, tokens, and session identifiers out of Git and model-visible output.
- Explicitly defer hosted HTTP, Auth0, OAuth 2.1, multi-account access, public publishing, and plugin packaging.

### Goal

Allow the household to use its one ChatGPT account to talk naturally with a private Nemlig integration, compile a shopping list, inspect the shared basket, review exact proposed changes, and apply only unchanged approved proposals while the local tunnel is running.

The first proof milestone is deliberately smaller: sign in locally, list exact favorites without mutation, obtain approval for one displayed favorite, add it through the existing basket path, and verify the basket readback in both the tool and Nemlig app. Only after that visible proof, a separately approved exact-line removal may verify that the same product can be removed without clearing the basket.

### Non-goals

- Reimplementing the TypeScript shopper work from PR #8.
- An always-on hosted MCP endpoint.
- Auth0, a custom authorization server, app-level OAuth, multiple ChatGPT identities, or self-service account linking.
- Public Plugins Directory submission, public signup, or merchant checkout integration.
- Requiring a packaged personal plugin before direct ChatGPT use.
- Checkout, payment, purchase, order placement, or delivery-slot mutation.
- Browser automation, recipe scraping, or restoration of removed recipe commands.
- Automated tests that use live credentials or mutate the real household basket.
- Treating login, connection setup, a proposal, or this OpenSpec as approval for a basket mutation.

### Acceptance Criteria

- PR #8 is merged and its expected CLI, client, stdio MCP server, tests, and picker form the implementation baseline.
- A private Developer mode app can reach the local stdio server through Secure MCP Tunnel.
- The direct integration works in a new normal ChatGPT Chat or Work conversation without launching or depending on Codex.
- An authenticated favorites lookup returns normalized product ID, name, size, current price, and availability without changing favorites or the basket.
- Nemlig credentials remain local and no password, cookie, access token, runtime API key, or session identifier appears in tool results, UI properties, logs, commits, or fixtures.
- The connection is unavailable clearly when the local computer, MCP server, or tunnel client is offline.
- Basket additions, exact-line removals, and clears can occur through ChatGPT only via an unexpired, unchanged, single-use proposal associated with the current private connection and basket.
- Price, availability, quantity, product, expiry, or basket changes invalidate the proposal without mutation.
- Every mutation is serialized, idempotency-aware, followed by basket readback, and stops on partial success or mismatch.
- Tool schemas, server instructions, optional UI, and annotations are discoverable and accurate in MCP Inspector and ChatGPT.
- No tool, skill, UI action, or endpoint can check out, pay, place an order, or change a delivery slot.
- Focused verification, strict OpenSpec validation, root pnpm verify, and a credential-leak review pass without autonomous live mutation.

## Capabilities

### New Capabilities

- nemlig-chatgpt-integration: Private single-account ChatGPT access through Secure MCP Tunnel, direct conversational use, local secret handling, and a documented boundary for future expansion.
- nemlig-basket-proposals: Server-enforced, connection-bound, revalidated, idempotency-aware basket proposal workflow for MCP and MCP Apps clients.

### Modified Capabilities

None. This proposal remains additive so it can be reviewed before PR #8 is merged. Application begins only after the rewrite change is merged and archived.

## Impact

- Refactors the post-PR #8 MCP tool surface and picker mutation flow under apps/nemlig-assistant.
- Adds proposal state, mutation serialization, tunnel configuration documentation, ChatGPT golden prompts, and focused tests.
- Updates the Nemlig skill, application instructions, tool names, metadata, and setup documentation.
- Does not add a hosted service, Auth0 integration, OAuth resource server, hosted secret manager, public listing, or required plugin package.
- Changes model-visible mutations from direct add and clear calls to prepare and apply operations for additions, exact-line removals, and clearing while retaining deliberate local CLI commands.

## Responsibilities Outside This Draft PR

This draft PR specifies the work but does not create the Platform tunnel, issue a runtime API key, sign in to Nemlig, start local processes, create the private ChatGPT app, or authorize a live basket change. Those actions are listed in [external-actions.md](./external-actions.md).

The current sequence is:

1. Finish and merge PR #8.
2. Implement and verify the proposal-safe stdio MCP surface.
3. Create the private Secure MCP Tunnel and run its client locally.
4. Create the private Developer mode app from the tunnel.
5. Verify the workflow in normal ChatGPT without Codex.
6. Approve any live basket mutation separately from its exact fresh proposal.

A hosted or multi-account version is a future architecture decision and requires a separate OpenSpec before implementation.
