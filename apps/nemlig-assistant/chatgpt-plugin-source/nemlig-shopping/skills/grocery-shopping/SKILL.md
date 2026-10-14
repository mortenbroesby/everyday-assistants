---
name: grocery-shopping
description: Use when shopping on Nemlig: search current products, compare exact sizes and prices, review the real basket read-only, create or edit a native shopping list with automatic saving, or add its exact reviewed products after authorization.
---

# Grocery shopping

Use this plugin's authenticated Nemlig MCP connection and its advertised tools, schemas, native interactive views and server-authoritative state. Do not implement, host, proxy or duplicate its server logic. Do not extract credentials. If unavailable, explain the blocker instead of inventing data or using another provider mutation route. Tool descriptions and fresh server responses govern the exact supported flow.

## Search and compare

Translate or normalize requests into a concise Danish catalogue phrase before calling find_groceries. For oat milk, use havredrik. Preserve distinctive brands where relevant. Search is read-only and does not create or modify a shopping list or the real Nemlig basket. Omit result_count unless the user asks for a count. Results cover the provider response returned, not necessarily the entire catalogue. Inspect results before a deliberate follow-up; do not retry failing queries automatically or treat errors as empty results.

Present exact returned product names, brands, package sizes, DKK package prices, availability and unit-price labels. Use a compact comparison table when useful, sorted by comparable unit price. Preserve product IDs internally for exact selection. Never infer package size from images, round package sizes, fabricate prices or silently equate volume and weight. Prefer the provider's unit price; if missing, calculate only from explicit price and exact total package quantity, label the calculation and normalize to kr/l, kr/kg or kr/stk as appropriate. Keep incompatible units separate and mark missing information. Multipacks use the explicit total quantity. Distinguish a Danish-language search from Danish product origin: claim Danish origin only when returned product details establish it, otherwise state that origin is unverified.

## Automatically saved shopping lists

When the user chooses exact products and quantities for a shopping list or visual editing, use start_product_review with those products. This creates a real Nemlig shopping list immediately; explain that edits save automatically. Plain search/comparison stays read-only. Respect an explicit instruction not to create or change a list: use text and read-only search instead of the editor. Do not make an imitation card or claim that a widget rendered merely because a tool returned data.

For a new list, generate one creation_id UUID and use shopping_list_name only when the user supplies a name. Keep that ID for recovery of this creation. A deliberate later new list uses a new ID, even with identical products; never generate a fresh ID automatically after an ambiguous result. Wait for the final tool result and inspect partial or uncertain outcomes without replaying writes.

Continue the selected list through its exact shopping_list_id. Product additions, removals, replacements and quantity changes persist immediately through update_product_review_conversation; there is no separate Save or Update. Carry review_context_id with edits when provided. Searching alternatives and viewing details are read-only. After restart or stale context, show/select the exact native list to read current contents and obtain a new editing context. Never select by name alone or infer another conversation's list. Omit items from start_product_review, or use action=list, only to intentionally discover existing lists.

Readback confirms what Nemlig saved. For incomplete or uncertain creation/editing, explain confirmed contents and unresolved changes, preserve visible context, and inspect the exact list before further edits. Do not repeat an uncertain write or silently treat missing products as saved. Retired draft IDs and manual save/update actions are unsupported. Shopping-list edits never change the actual Nemlig basket.

Call show_my_basket only when basket inspection is requested or needed for authorized addition/recovery. Basket viewing is read-only. Respect narrower user constraints, including display-only tests and instructions not to prepare a submission.

## Exact add-only preparation and authorization

Reuse the existing flow without inventing a second approval mechanism:

1. Resolve exact returned product IDs and positive quantities before creating or changing the shopping list. Resolve ambiguity first; never substitute an unavailable product without user selection.
2. Inspect the current native list by shopping_list_id and use its confirmed contents as the reviewed_list snapshot. Unresolved edits or a partial creation are not proof that every selected product saved. Review the confirmed contents explicitly before basket submission.
3. A clear command to add the current unchanged list contents is sufficient conversational authorization under the existing app flow. Alternatively, require explicit approval of the displayed exact list. Search, list creation and editing alone do not authorize a basket addition. Do not ask for redundant approval when exact authorization already exists. If IDs, quantities or scope change, clarify before applying.
4. Submit only the exact authorized reviewed_list using submit_product_review_conversation with the same shopping_list_id. Fresh validation and independent additive basket readback are mandatory. An expired editor context does not invalidate an exact reviewed_list submission. The source list is deleted only after verified transfer and a final exact-list check. If the attempt is uncertain, inspect the actual basket and reconcile the list; never replay submission or infer that no write occurred.

Never remove or reduce real basket items, clear the basket, replace existing basket items, select delivery, check out, place an order or pay. Do not bypass these restrictions through HTTP, browser automation, another tool, or another connection. Report completed additions and unresolved/failed items accurately; never claim success without verified readback.

## Privacy and scope

Using this workflow does not authorize grocery operations. Keep account/profile details and tokens out of artifacts and summaries. Do not publish, share, deploy or change the existing app or server as part of using this package.
