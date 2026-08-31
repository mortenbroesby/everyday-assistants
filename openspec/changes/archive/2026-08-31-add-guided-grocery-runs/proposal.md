## Why

The assistant can find or add one product at a time, but a real grocery run still requires repeated searches, manual comparison, and repeated picker actions. A guided run should resolve a whole list favorites-first, preserve uncertain choices for review, and reuse the existing exact batch proposal instead of creating another mutation path.

## What Changes

- Add a ChatGPT-first read-only planning workflow for 1-20 structured grocery lines with quantities and optional dietary, discount, availability, and price preferences.
- Resolve each line against authenticated favorites first, then the general catalog only when no favorite matches; retain multiple plausible candidates and unresolved lines rather than selecting silently.
- Return deterministic preference and price ranking, current-basket coverage, remaining quantities, and an estimated selected total.
- Add read-only department discovery, bounded department browsing, and explicit pagination for catalog and favorites results.
- Expand the MCP Apps picker into an accessible multi-line review workspace with alternatives, quantities, unresolved states, and one exact batch proposal review.
- Save and resume immutable local plan snapshots in owner-only ignored storage without adding deletion, synchronization, or hosted state.
- Reuse `prepare_cart_additions` and `apply_cart_additions` unchanged for every basket write; planning, selection, persistence, and proposal preparation remain non-authorizing.

### Non-goals

- A local natural-language parser; ChatGPT converts conversation into structured planning input.
- Automatic product selection, favorites mutation, basket replacement, or combined remove-and-add proposals.
- Recipe parsing, checkout, payment, purchase, order placement, or delivery-slot changes.
- Hosted plans, multi-user accounts, cross-device sync, or public ingress.
- Live-account acceptance in automated tests; the owner will perform the final alpha exercise after synthetic verification and delivery.

### Acceptance criteria

- One conversational request can produce a structured plan for up to 20 grocery lines, showing favorites-first candidates, ambiguity, unavailable or unresolved lines, preferences, quantities, basket coverage, and estimated totals without mutation.
- Department browsing and paginated favorites/catalog retrieval return the existing normalized product fields and deterministic ranking metadata.
- The picker can review and adjust several lines, prepare one unchanged batch addition, display every exact line and total, and apply it only after explicit approval through the existing proposal protocol.
- Plans can be saved as immutable owner-only local snapshots and resumed by ID without exposing credentials, prompts, or basket contents to Git.
- Existing CLI and MCP interfaces remain compatible; focused synthetic tests and `pnpm verify` pass without Nemlig credentials or live basket mutation.

## Capabilities

### New Capabilities

- `nemlig-guided-shopping`: Whole-list resolution, preferences, basket-gap analysis, department discovery, pagination, and local plan snapshots.

### Modified Capabilities

- `nemlig-shopper`: Expose department browsing and paginated favorites retrieval while preserving existing commands and safety behavior.
- `nemlig-mcp`: Add ChatGPT-first structured planning and the multi-line picker workspace with accurate tool metadata.
- `nemlig-basket-proposals`: Extend picker interaction from one product card to an exact multi-line batch review while retaining the existing prepare/apply protocol.

## Impact

The change affects the Nemlig client, CLI, MCP server, picker resource, proposal-facing UI tests, local configuration storage, package smoke tests, and the corresponding OpenSpec capabilities. It adds no dependency, public service, hosted secret, new basket mutation operation, or ordering capability.
