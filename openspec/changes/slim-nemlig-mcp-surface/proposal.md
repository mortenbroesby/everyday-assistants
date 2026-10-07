## Why

The Nemlig Assistant MCP catalog advertises several overlapping paths for finding products and adding them to a basket. The user also cannot reliably tell whether a “basket,” “review,” or “selection” refers to temporary choices or the actual Nemlig basket. A smaller catalog and consistent names make the agent's next action easier to predict.

## What Changes

- **BREAKING** Retain exactly six user MCP tools: `check_nemlig_connection`, `find_groceries`, `show_my_basket`, `start_product_review`, `update_product_review`, and `submit_product_review`. Retire the other nine advertised tools, including `get_profile` and `show_my_basket_visually`. Calls to retired names receive the normal unknown-tool response.
- Call the temporary conversation workspace the **Draft list**, with **To decide** and **Ready** states. Call the provider state the **Nemlig basket**. “Review” describes deciding or confirming; it is not a separate store.
- Keep exact add-only preparation, user authorization, single-use application, verified basket readback, and uncertain-write recovery through the Draft list submission path.
- Align production and machine-service inventories, documentation, viewer copy, and release notes. Publish this as a major package version when released.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Reduce the advertised tool catalog and retain a coherent search, basket read, and Draft list route.
- `nemlig-basket-proposals`: Make the Draft list submission the only model-visible provider-basket write path.
- `nemlig-product-review`: Name the temporary workspace and states consistently while preserving its safety behavior.
- `nemlig-chatgpt-integration`: Describe ChatGPT discovery and basket requests using the six-tool catalog and the Draft list/Nemlig basket distinction.

## Impact

`apps/nemlig-assistant` MCP registration, gateway service allowlist, production acceptance, viewer, tests, README, and basket instructions. The six-tool change intentionally breaks callers of retired tool IDs; it does not change provider credentials, checkout, production deployment, or the real Nemlig basket during implementation. This change is delivered on `codex/nemlig-six-tool-surface` in one PR. It supersedes the tool-retention and “Your Nemlig selection” decisions in the still-active `voice-first-product-review` change; that change's remaining live-acceptance tasks are separate evidence gates.

## Acceptance

- The normal catalog has exactly the six retained tools; service acceptance advertises only search and basket read and rejects draft edits/submission.
- A synthetic search → Draft list → Ready → prepared submission → verified basket readback flow works, and an uncertain write is attempted once.
- User-facing guidance and viewer text clearly distinguish Draft list from Nemlig basket; retired tools are absent.
- Applicable local verification passes. No live deployment or provider basket mutation is performed by this change.
