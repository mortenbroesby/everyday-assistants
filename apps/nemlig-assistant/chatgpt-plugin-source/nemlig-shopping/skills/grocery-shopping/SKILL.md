---
name: grocery-shopping
description: Use when shopping on Nemlig: search current products, compare exact sizes and prices, review the real basket read-only, build a local shopping list, or add exact selected items after authorization.
---

# Grocery shopping

Use this plugin's authenticated Nemlig MCP connection and its advertised tools, schemas, native interactive views and server-authoritative state. Do not implement, host, proxy or duplicate its server logic. Do not extract credentials. If unavailable, explain the blocker instead of inventing data or using another provider mutation route. Tool descriptions and fresh server responses govern the exact supported flow.

## Search and compare

Translate or normalize requests into a concise Danish catalogue phrase before calling find_groceries. For oat milk, use havredrik. Preserve distinctive brands where relevant. Search is read-only and does not create or modify a Draft list or basket. Omit result_count unless the user asks for a count. Results cover the provider response returned, not necessarily the entire catalogue. Inspect results before a deliberate follow-up; do not retry failing queries automatically or treat errors as empty results.

Present exact returned product names, brands, package sizes, DKK package prices, availability and unit-price labels. Use a compact comparison table when useful, sorted by comparable unit price. Preserve product IDs internally for exact selection. Never infer package size from images, round package sizes, fabricate prices or silently equate volume and weight. Prefer the provider's unit price; if missing, calculate only from explicit price and exact total package quantity, label the calculation and normalize to kr/l, kr/kg or kr/stk as appropriate. Keep incompatible units separate and mark missing information. Multipacks use the explicit total quantity. Distinguish a Danish-language search from Danish product origin: claim Danish origin only when returned product details establish it, otherwise state that origin is unverified.

When the user asks to see products visually, use the native Draft list view by default: search for exact product IDs, then start_product_review. This creates only conversation-local review state, not a real basket change. Reuse an active Draft list; add newly found products through update_product_review_conversation add and reopen its card with start_product_review without items only when asked or the current card is stale. Do not make an image table or imitation card. Respect an explicit instruction not to create or edit a Draft list. If a later visual request conflicts with it, explain that the native view needs local Draft state and ask whether to allow it; use a concise text comparison until then. Do not claim a widget rendered merely because a tool returned data; report display failures honestly.

## Read-only basket and local Draft list

Call show_my_basket only when basket inspection is requested or required by the authorized existing addition/recovery flow. Basket viewing is read-only. A plain search/comparison request does not authorize basket access, a local Draft list or preparation; a request to see products visually authorizes the local Draft list unless the user rules it out.

Use start_product_review with exact returned product IDs and requested quantities to create the local Draft list, or omit items to reopen the active list without changing it. Use update_product_review_conversation show to read its current revision for edits. Local acceptance into Ready is not authorization to add to Nemlig. Local removal, replacement and quantity edits affect only the temporary Draft list and must never remove or reduce real basket items. Respect narrower user constraints, including display-only smoke tests and instructions not to prepare.

## Exact add-only preparation and authorization

Reuse the existing flow without inventing a second approval mechanism:

1. Resolve exact product IDs and positive quantities in the current local Draft list. Resolve ambiguity before applying changes. Never substitute an unavailable product without user selection.
2. Prepare only current Ready lines with update_product_review_conversation action prepare_submission. Use fresh exact prices and quantities and preserve unrelated basket lines. Keep the server-issued review_id, current revision and submission_id.
3. A clear user command to add the current unchanged Ready Draft list is sufficient conversational authorization under the existing app flow. Alternatively, require explicit approval of the displayed exact prepared submission. A search, Ready acceptance, request to inspect, or preparation-only request is not authorization. Do not ask for redundant approval when exact authorization already exists. If Ready IDs or quantities change after the command, or scope is unclear, clarify before applying; reprepare whenever the prepared payload is invalidated or expired. Follow any server-required price-change approval.
4. Submit only that exact current prepared payload using submit_product_review_conversation. Fresh validation and verified basket readback are mandatory. Stop on uncertainty. Never automatically retry submission; on errors inspect current Draft state and actual basket before deciding on recovery, within user-authorized scope.

Never remove or reduce real basket items, clear the basket, replace existing basket items, select delivery, check out, place an order or pay. Do not bypass these restrictions through HTTP, browser automation, another tool, or another connection. Report completed additions and unresolved/failed items accurately; never claim success without verified readback.

## Privacy and scope

Using this workflow does not authorize grocery operations. Keep account/profile details and tokens out of artifacts and summaries. Do not publish, share, deploy or change the existing app or server as part of using this package.
