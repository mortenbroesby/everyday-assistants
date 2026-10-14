---
name: grocery-shopping
description: Use when shopping on Nemlig: search current products, compare exact sizes and prices, review the real basket read-only, build a local shopping list, or add exact selected items after authorization.
---

# Grocery shopping

Use this plugin's authenticated Nemlig MCP connection and its advertised tools, schemas, native interactive views and server-authoritative state. Do not implement, host, proxy or duplicate its server logic. Do not extract credentials. If unavailable, explain the blocker instead of inventing data or using another provider mutation route. Tool descriptions and fresh server responses govern the exact supported flow.

## Search and compare

Translate or normalize requests into a concise Danish catalogue phrase before calling find_groceries. For oat milk, use havredrik. Preserve distinctive brands where relevant. Search is read-only and does not create or modify a draft or the real Nemlig basket. Omit result_count unless the user asks for a count. Results cover the provider response returned, not necessarily the entire catalogue. Inspect results before a deliberate follow-up; do not retry failing queries automatically or treat errors as empty results.

Present exact returned product names, brands, package sizes, DKK package prices, availability and unit-price labels. Use a compact comparison table when useful, sorted by comparable unit price. Preserve product IDs internally for exact selection. Never infer package size from images, round package sizes, fabricate prices or silently equate volume and weight. Prefer the provider's unit price; if missing, calculate only from explicit price and exact total package quantity, label the calculation and normalize to kr/l, kr/kg or kr/stk as appropriate. Keep incompatible units separate and mark missing information. Multipacks use the explicit total quantity. Distinguish a Danish-language search from Danish product origin: claim Danish origin only when returned product details establish it, otherwise state that origin is unverified.

When the user asks to see products visually, search for exact product IDs and start_product_review with those exact products and quantities. This creates an unsaved draft, not a real basket change. Repeating a start with the same product-ID set reopens the current edited draft; a different set returns a conflict and preserves it. Add products through update_product_review_conversation add, or explicitly end the draft before starting a replacement. Use action=list to open the saved-list picker and pass shopping_list_id to select a specific saved list. Without host conversation metadata, continue a draft only with its exact draft_id; never use an implicit active draft or list selection. Respect an explicit instruction not to start or edit a draft. Do not make an image table or imitation card. Do not claim a widget rendered merely because a tool returned data; report display failures honestly.

## Read-only Nemlig basket and draft products

Call show_my_basket only when basket inspection is requested or required by the authorized addition/recovery flow. Basket viewing is read-only. A plain search/comparison request does not authorize basket access or a product draft; a request to see products visually authorizes showing those products in an unsaved draft unless the user rules it out. A draft is process-local and does not change Nemlig.

Use start_product_review with exact returned product IDs and requested quantities to create an unsaved draft. Omit items only to explicitly open the saved-list picker. Use update_product_review_conversation action=list to browse native lists, action=select with an exact shopping_list_id to open one, and show only with an explicit draft_id or shopping_list_id when host conversation metadata is absent. Retired Local Basket IDs and actions fail tool argument validation and never open a picker or resolve to another list. Use action=list explicitly to browse native lists. Every row is a submission candidate; this alone is not authorization to add to Nemlig. Draft removal and quantity edits remain local; native-list changes require explicit Update and exact readback. Respect narrower user constraints, including display-only smoke tests and instructions not to prepare.

## Exact add-only preparation and authorization

Reuse the existing flow without inventing a second approval mechanism:

1. Resolve exact product IDs and positive quantities for the draft. Resolve ambiguity before saving or adding. Never substitute an unavailable product without user selection.
2. Save only when the user intends to create a native Nemlig shopping list. Inspect the exact saved list contents; use its shopping_list_id and current reviewed_list snapshot for submission. Staged changes require explicit action=update and verification against that same list. Carry review_context_id with edits when the card provides one; an expired context does not invalidate an exact reviewed_list submission.
3. A clear user command to add the current unchanged saved-list contents is sufficient conversational authorization under the existing app flow. Alternatively, require explicit approval of the displayed exact saved-list submission. A search, request to inspect, or draft/save request alone is not authorization to add products to the basket. Do not ask for redundant approval when exact authorization already exists. If IDs, quantities, or scope change after the command, clarify before applying.
4. Submit only the exact authorized reviewed_list using submit_product_review_conversation with the same shopping_list_id. Fresh validation and independent additive basket readback are mandatory. The source list is deleted only after verified transfer and a final exact-list check. If the attempt is uncertain, inspect the actual Nemlig basket and reconcile the saved list; never replay the uncertain submission or infer that no write occurred.

Never remove or reduce real basket items, clear the basket, replace existing basket items, select delivery, check out, place an order or pay. Do not bypass these restrictions through HTTP, browser automation, another tool, or another connection. Report completed additions and unresolved/failed items accurately; never claim success without verified readback.

## Privacy and scope

Using this workflow does not authorize grocery operations. Keep account/profile details and tokens out of artifacts and summaries. Do not publish, share, deploy or change the existing app or server as part of using this package.
