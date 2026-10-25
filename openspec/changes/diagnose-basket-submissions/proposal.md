## Why

Delivery and incident follow-up: [issue #357](https://github.com/mortenbroesby/everyday-assistants/issues/357).

The 2026-10-25 native Submit failed without retained provider-level cause. Recovery could mistake pre-existing products for a successful addition. The goal is diagnosable failures and exact, read-only recovery while keeping uncertain writes fenced.

## What Changes

- Preserve closed failure stage/category/HTTP status and a boolean indication of provider validation failures; never retain raw provider errors.
- Extend existing `show_my_basket` with optional exact draft identity to compare durable baseline, dispatched additions and current quantities after restart.
- Send that identity from the viewer recovery action and preserve safe diagnostics in its failure message.
- Maintain the failure compendium and regression checklist. The original provider cause remains unknown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-basket-proposals`: safe submission diagnostics and non-attributing quantity comparison.
- `nemlig-mcp`: optional owner-bound submission inspection through the existing read-only basket tool.

## Impact

Client errors, durable journal/callback schema, product review service, MCP and viewer recovery. No new dependency or tool. Existing receipts remain readable; optional metadata is additive. One branch `codex/nemlig-failure-compendium`, existing PR #350.

Acceptance: classify synthetic dispatch/readback failures without leaking bodies; verify overlapping additions and preserved existing rows; recover via actual MCP/callback/storage after reconstruction; matching quantities never complete an uncertain receipt or authorize replay.

Non-goals: infer the missing historical response, change provider request semantics, retry the uncertain addition, reconnect credentials, deploy, or redesign unrelated UI. Production and new live mutation acceptance remain separate.
