## Why

Nemlig Assistant is already useful, but recent recipe runs exposed an awkward split: `plan_my_shopping` left 28 of 30 ordinary ingredients unresolved, while later individual searches succeeded after the user simplified phrases such as `mørk chokolade til bagning` to `mørk chokolade`. The current visual chooser also treats one product at a time and jumps toward basket review instead of helping the family inspect a complete proposed shop.

The family wants ChatGPT to reason about each ingredient, search with short Danish terms until it finds useful options, consult Nemlig favourites when uncertain, and present a polished proposed basket before any basket approval.

## What Changes

- Make individual `find_groceries` searches the normal recipe-shopping path. Start with one- or two-word Danish terms, refine unsuccessful or unsuitable searches, and distinguish catalogue interpretation from connectivity failure.
- Keep `plan_my_shopping` for compatibility and explicit batch use, but stop presenting it as the required first step for ordinary recipe shopping.
- Let ChatGPT propose a product and an honest 0–100 match-confidence score from current product evidence. Confidence is a decision aid, not a statistical probability.
- Consult existing Nemlig favourites for uncertain matches without storing preferences in Cloudflare. Record explicitly approved add/remove-favourite tools as an early follow-up after the provider contract is verified.
- Add one read-only proposed-basket view. It shows every chosen item with image, description, package size, quantity, price, unit price, confidence, and collapsed alternatives. Choices below 80% expand automatically.
- For fewer than twenty items, allow visual review across the whole proposal. Present actionable decisions in groups of at most five; larger shops keep confident items compact and group only uncertain decisions.
- State omitted pantry assumptions such as flour, salt, and pepper. Planning neither displays nor uses the current Nemlig basket. The separately approved mutation flow retains its existing internal before/after basket verification.
- After choices are settled, show the complete proposed basket again before creating the exact basket-addition review. Preserve fresh product revalidation, exact approval scope, single-attempt writes, and verified readback.
- Add a deterministic recipe-scale smoke scenario and fresh ChatGPT acceptance steps that cover discovery, favourites, grouped choices, proposed-basket review, approval boundaries, and final readback.

### Goal

Make recipe and meal-prep shopping feel like an interactive product-selection assistant: persistent individual discovery, useful recommendations, limited meaningful choices, and one clear proposed basket before an approved add.

### Non-goals

- Perfect catalogue classification or a learned recommendation system.
- Cloudflare preference profiles, pantry storage, or saved shopping lists.
- Add/remove Nemlig favourites in this change.
- Removing the existing batch planner or weakening basket-mutation verification.
- Checkout, payment, ordering, or delivery-slot changes.
- Unbounded server-side retry loops or new paid services.

### Acceptance criteria

- A recipe request is resolved through individual short searches; unsuitable or empty results can be refined without exposing internal tool choreography.
- Each proposed item carries current evidence and a match-confidence score; below-80 items receive actionable alternatives in groups of no more than five.
- Existing favourites are consulted only for uncertain matches and can raise a matching product in the proposed choices.
- The proposed-basket view contains only proposed additions and stated pantry assumptions, never the current basket.
- A deterministic mixed recipe fixture proves confident selections, uncertain choices, package quantities, final exact review, authorization rejection on drift, application, verified readback, and no write retry.
- The normal live acceptance remains read-only until a separate exact basket mutation is explicitly authorized.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Make individual, persistent catalogue discovery and grouped visual review the normal recipe workflow.
- `nemlig-guided-shopping`: Add confidence-aware proposed choices, favourite guidance, pantry assumptions, and a complete proposed-basket review.
- `nemlig-mcp`: Provide a read-only grouped proposal UI and representative conversational smoke path.
- `nemlig-package-distribution`: Require the recipe-scale smoke path in production readiness.

## Impact

Expected code changes are limited to MCP tool instructions/contracts, candidate presentation, the existing MCP App resource, focused tests, smoke coverage, and user-facing documentation. The design adds no storage, dependency, Container, scheduler, queue, autoscaling, or paid service. ChatGPT may make more read-only search calls; existing authentication-before-wake, per-request deadlines, account quotas, breaker, kill switch, and one-Container ceiling remain the hard cost boundary.
