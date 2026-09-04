## Why

The current saved-plan feature stores opaque immutable snapshots, so a household cannot reliably name, find, edit, or reuse several shopping lists. Real ChatGPT use also showed that current Nemlig product questions may fall back to public web search and that the interactive picker omits the product images already returned by the backend.

The goal is to make Nemlig Assistant useful as a small family food system: keep several understandable lists, reuse a weekly baseline without automatic ordering, resolve current products through Nemlig first, and choose visually when products are ambiguous.

## What Changes

- Add owner-bound named shopping lists that can be created, listed, opened, renamed, edited, duplicated, archived, and restored.
- Treat a recurring list as a reusable household template, not as a scheduler: opening it refreshes current Nemlig candidates, prices, availability, favorites, and basket coverage only on explicit request.
- Let named lists contain ordinary grocery lines or an optional preferred exact Nemlig product, quantity, constraints, preferences, and a short household note.
- Prepare selected current list items through the existing exact review and approval flow without allowing a saved list to authorize a basket mutation.
- Preserve existing immutable saved-plan references long enough to load or migrate them without silently discarding private state.
- Strengthen MCP guidance so current Nemlig price, availability, favorite, product-selection, and list requests prefer the Nemlig tools; public web search remains appropriate for recipes and general food information.
- Render bounded product images in the picker using allowlisted direct image hosts, lazy loading, and a non-image fallback without proxying image bytes through the Worker.
- Extend production acceptance to cover list lifecycle, owner isolation, Nemlig-first metadata, visual-picker image metadata, and unchanged basket-safety behavior.
- Update the one existing private ChatGPT app in place: deploy the hosted MCP, then Refresh the canonical `Nemlig Assistant` connection so it rediscovers tools. Never create `Nemlig Assistant (new)`, `Nemlig Assistant [new]`, numbered copies, or another parallel Nemlig app for an ordinary release.
- Keep the one-owner hosted alpha, one-Container ceiling, quotas, kill switch, bounded retries, and authentication-before-wake controls unchanged.

### Non-goals

- No automatic scheduled basket changes, recurring background jobs, stock sensors, checkout, ordering, payment, or delivery-slot changes.
- No public sharing, family-member identity support, or multiple Nemlig-account mapping in this change.
- No new database, paid provider, image proxy, generic autoscaling, or horizontally scaled Container path.
- No attempt to prohibit all ChatGPT web use; the change improves tool selection for Nemlig-specific current data through accurate metadata and instructions.

### Acceptance criteria

- The owner can maintain multiple clearly named lists such as `Weekly essentials` and `Birthday party`, then find and reopen them without handling UUIDs.
- Reopening a reusable list refreshes current Nemlig data and basket coverage but changes neither the list nor the basket unless the owner explicitly performs the corresponding action.
- The picker visibly distinguishes ambiguous products with current images when available and remains fully usable when an image is absent or the host cannot render MCP Apps.
- Routine releases retain exactly one installed app named `Nemlig Assistant`; its metadata and tools are refreshed in place without a suffixed or bracketed replacement.
- Current Nemlig catalogue questions are described and tested as Nemlig-first while general recipe questions remain outside that routing rule.
- Existing saved snapshots remain loadable or receive a documented bounded migration path.
- Repository and production acceptance prove that list operations cannot bypass exact proposal approval, cost ceilings, authentication, or owner isolation.

## Capabilities

### New Capabilities

- `nemlig-shopping-lists`: Owner-bound named, editable, reusable multiple shopping lists and their safe lifecycle.

### Modified Capabilities

- `nemlig-guided-shopping`: Replace opaque snapshot-only reuse with named-list resolution while preserving catalogue-backed planning, basket gap analysis, and legacy snapshot compatibility.
- `nemlig-mcp`: Add list-management tools, Nemlig-first current-product routing guidance, visual product images, and corresponding production acceptance coverage.
- `nemlig-chatgpt-integration`: Require in-place refresh of the one canonical `Nemlig Assistant` app and tightly constrain exceptional replacement when an immutable app property must change.

## Impact

- `apps/nemlig-assistant/src/plans.ts` and hosted plan storage evolve from create/read snapshots into a bounded owner-scoped list repository with legacy-read compatibility.
- `apps/nemlig-assistant/src/mcp.ts`, MCP metadata, picker HTML/CSP, interfaces, and production acceptance gain the list surface, routing guidance, and image rendering.
- Existing proposal services remain the only model-visible path to basket writes.
- The existing storage Durable Object is reused; no new provider or unbounded infrastructure is introduced. Family-scale list metadata adds negligible storage and request volume under explicit list and item caps.
- User-facing feature inventory, backlog, and Cloudflare operations documentation require updates when the feature ships.
- ChatGPT operator documentation changes from recreate-and-reconnect guidance to deploy-and-refresh-in-place guidance for ordinary releases.
