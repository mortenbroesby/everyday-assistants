---
name: grocery-shopping
description: Use when shopping on Nemlig: search and compare current products, review the real basket read-only, edit a temporary basket draft, or add its exact reviewed products after authorization.
---

# Grocery shopping

Use this plugin's authenticated Nemlig MCP connection and its advertised tools, schemas, native interactive views and server-authoritative state. Do not implement, host, proxy or duplicate its server logic. Do not extract credentials. If unavailable, explain the blocker instead of inventing data or using another provider mutation route. Tool descriptions and fresh server responses govern the exact supported flow.

## Search and compare

Translate or normalize requests into a concise Danish catalogue phrase before calling find_groceries. For oat milk, use havredrik. Preserve distinctive brands where relevant. Search is read-only and does not create or modify a shopping list or the real Nemlig basket. Omit result_count unless the user asks for a count. Results cover the provider response returned, not necessarily the entire catalogue. Inspect results before a deliberate follow-up; do not retry failing queries automatically or treat errors as empty results.

Present exact returned product names, brands, package sizes, DKK package prices, availability and unit-price labels. Use a compact comparison table when useful, sorted by comparable unit price. Preserve product IDs internally for exact selection. Never infer package size from images, round package sizes, fabricate prices or silently equate volume and weight. Prefer the provider's unit price; if missing, calculate only from explicit price and exact total package quantity, label the calculation and normalize to kr/l, kr/kg or kr/stk as appropriate. Keep incompatible units separate and mark missing information. Multipacks use the explicit total quantity. Distinguish a Danish-language search from Danish product origin: claim Danish origin only when returned product details establish it, otherwise state that origin is unverified.

## Temporary basket draft

When the user chooses exact products and quantities for visual editing, call `start_product_review` with `items: [{product_id, quantity}]`. This creates a temporary process-local draft, not a saved Nemlig shopping list. Draft edits do not change the real basket. Plain search/comparison stays read-only. Respect a display-only request: use text and read-only search instead of creating a draft. Do not make an imitation card or claim that a widget rendered merely because a tool returned data.

To load a saved list as a read-only source, call `start_product_review` with its exact `shopping_list_id` and no `items`. To discover lists, omit both inputs, then select by exact ID; never infer a target from its name or another conversation's card. The source list is never edited or deleted by draft actions or submission. Do not supply `creation_id` or `shopping_list_name` for temporary drafts, or combine `items` with `shopping_list_id`.

Continue the active draft through `update_product_review_conversation`, passing its exact `draft_id`, `review_context_id`, and `action` (for example `{kind: "quantity", product_id, quantity}`). Add, remove, replace, and quantity actions change only this draft. Searching alternatives and viewing details are read-only. Drafts expire after two hours and cannot be recovered after a server restart. If a draft is unavailable, explain the loss and start a new one only from newly confirmed exact products; never silently reuse a stale card or restore submission authority.

Use the returned draft snapshot to confirm local edits. Do not describe it as provider-saved state. Retired `basket_id`, `delete`, and `heartbeat` inputs are unsupported. Do not claim that a temporary draft can be saved directly to a Nemlig list.

Call show_my_basket only when basket inspection is requested or needed for authorized addition/recovery. Basket viewing is read-only. Respect narrower user constraints, including display-only tests and instructions not to prepare a submission.

## Exact add-only preparation and authorization

Reuse the existing flow without inventing a second approval mechanism:

1. Resolve exact returned product IDs and positive quantities. Resolve ambiguity first; never substitute an unavailable product without user selection. Review the current draft's exact name, product IDs, and quantities.
2. Search and draft editing alone do not authorize a basket addition. Obtain separate explicit authorization for the exact reviewed additions, unless a clear existing instruction already authorizes that unchanged payload. If identity, quantities, or scope change, clarify before applying.
3. Submit only that payload with `submit_product_review_conversation`: exact `draft_id`, `review_context_id`, a unique `submission_id` UUID for this authorized attempt, and `reviewed_list: {name, items: [{product_id, quantity}]}`. Never substitute a saved-list ID for the active draft. The server validates the current draft, sends one additive basket request, and independently checks readback. If the attempt is uncertain, inspect the actual basket; never replay it or infer that no write occurred.
4. Only after verified addition, the viewer may offer its **app-only** `save_basket_as_shopping_list` action. This optionally saves the entire current basket, including older rows, and does not clear it. Do not call or advertise it as a model-facing tool; do not claim a saved-list ID without provider evidence. An uncertain save is not retried.

Never remove or reduce real basket items, clear the basket, replace existing basket items, select delivery, check out, place an order or pay. Do not bypass these restrictions through HTTP, browser automation, another tool, or another connection. Report completed additions and unresolved/failed items accurately; never claim success without verified readback.

## Privacy and scope

Using this workflow does not authorize grocery operations. Keep account/profile details and tokens out of artifacts and summaries. Do not publish, share, deploy or change the existing app or server as part of using this package.
