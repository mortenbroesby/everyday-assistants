---
name: grocery-shopping
description: Use when shopping on Nemlig: search current products, compare exact sizes and prices, review the real basket read-only, build a local shopping list, or add exact selected items after authorization.
---

# Grocery shopping

Use this plugin's authenticated Nemlig MCP connection and its advertised tools, schemas, native interactive views and server-authoritative state. Do not implement, host, proxy or duplicate its server logic. Do not extract credentials. If unavailable, explain the blocker instead of inventing data or using another provider mutation route. Tool descriptions and fresh server responses govern the exact supported flow.

## Search and compare

Translate or normalize requests into a concise Danish catalogue phrase before calling find_groceries. For oat milk, use havredrik. Preserve distinctive brands where relevant. Search is read-only and does not create or modify a Local basket or the real Nemlig basket. Omit result_count unless the user asks for a count. Results cover the provider response returned, not necessarily the entire catalogue. Inspect results before a deliberate follow-up; do not retry failing queries automatically or treat errors as empty results.

Present exact returned product names, brands, package sizes, DKK package prices, availability and unit-price labels. Use a compact comparison table when useful, sorted by comparable unit price. Preserve product IDs internally for exact selection. Never infer package size from images, round package sizes, fabricate prices or silently equate volume and weight. Prefer the provider's unit price; if missing, calculate only from explicit price and exact total package quantity, label the calculation and normalize to kr/l, kr/kg or kr/stk as appropriate. Keep incompatible units separate and mark missing information. Multipacks use the explicit total quantity. Distinguish a Danish-language search from Danish product origin: claim Danish origin only when returned product details establish it, otherwise state that origin is unverified.

When the user asks to see products visually, use the native Local basket view by default: search for exact product IDs, then start_product_review. This creates or opens owner-scoped Local state, not a real basket change. Each owner can keep up to 50 unnamed baskets, each with up to 500 distinct product lines; a basket expires 24 hours after explicit activity. A host may remember the selected basket only when it supplies a stable conversation identifier. Without one, show the picker and require explicit selection. Reconnected credentials recover product snapshots, never a prepared submission or provider authority. When a new grocery request arrives while baskets exist, make append-to-existing versus create-new an explicit choice; never silently choose. Add exact new finds through update_product_review_conversation add. Every card mutation must carry that card's basket_id. Do not make an image table or imitation card. Respect an explicit instruction not to create or edit a Local basket. If a later visual request conflicts with it, explain that the native view needs Local basket state and ask whether to allow it; use a concise text comparison until then. Do not claim a widget rendered merely because a tool returned data; report display failures honestly.

## Read-only Nemlig basket and Local basket

Call show_my_basket only when basket inspection is requested or required by the authorized existing addition/recovery flow. Basket viewing is read-only. A plain search/comparison request does not authorize basket access, a Local basket or preparation; a request to see products visually authorizes the Local basket unless the user rules it out.

Use start_product_review with exact returned product IDs and requested quantities to create a new Local basket. Omit items to show the remembered basket only when the host provides a stable conversation identifier; otherwise show the picker. Use update_product_review_conversation list, select and show to browse owner baskets. Historical cards without a basket_id must return to the picker, never target a different remembered basket. Every row is a local submission candidate; this alone is not authorization to add to Nemlig. Local removal, replacement and quantity edits affect only that Local basket and must never remove or reduce real basket items. Confirm before manual deletion. Respect narrower user constraints, including display-only smoke tests and instructions not to prepare.

## Exact add-only preparation and authorization

Reuse the existing flow without inventing a second approval mechanism:

1. Resolve exact product IDs and positive quantities in the current Local basket. Resolve ambiguity before applying changes. Never substitute an unavailable product without user selection.
2. Prepare every current Local basket row with update_product_review_conversation action prepare_submission. The server reports and excludes confirmed unavailable products, while unresolved details stop preparation. Inspect the exact prepared lines and any skipped products; prices may be missing or change. Keep the server-issued submission_id, which binds submission to the exact prepared payload.
3. A clear user command to add the current unchanged Local basket is sufficient conversational authorization under the existing app flow. Alternatively, require explicit approval of the displayed exact prepared submission. A search, request to inspect, or preparation-only request is not authorization. Do not ask for redundant approval when exact authorization already exists. If IDs or quantities change after the command, or scope is unclear, clarify before applying; reprepare whenever the prepared payload is invalidated or expired.
4. Submit only that exact current prepared payload using submit_product_review_conversation with the same basket_id. Fresh validation and verified basket readback are mandatory. A verified successful terminal result deletes that Local basket. If the attempt is uncertain or partial, its record is inspect-or-delete only: inspect the actual Nemlig basket, then create a new Local basket and obtain fresh exact authorization before another submission. Never retry or reprepare the fenced record.

Never remove or reduce real basket items, clear the basket, replace existing basket items, select delivery, check out, place an order or pay. Do not bypass these restrictions through HTTP, browser automation, another tool, or another connection. Report completed additions and unresolved/failed items accurately; never claim success without verified readback.

## Privacy and scope

Using this workflow does not authorize grocery operations. Keep account/profile details and tokens out of artifacts and summaries. Do not publish, share, deploy or change the existing app or server as part of using this package.
