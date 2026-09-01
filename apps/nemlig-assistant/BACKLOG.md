# Nemlig Assistant backlog

## Human-friendly shopping confirmations

Show basket proposals and results like a normal shopping assistant, not a
technical transaction log. Prefer a clean line such as “1 banana · 2.50 kr.”
and a simple confirmation question.

- Keep product IDs, proposal UUIDs, expiry timestamps, protocol terms, and
  internal status fields out of ordinary user-facing messages.
- Show package size or price detail only when it helps distinguish products or
  make the choice clear.
- Keep exact product binding, expiry, revalidation, single use, and basket
  readback internally; simpler wording must not weaken mutation safety.
- Make technical details available only for troubleshooting or an explicit user
  request.

## Favorites-first product selection

**Status:** Core routing implemented. Ordinary find-or-add intent uses the
favorites-first planner, explicit catalog searches retain `search_products`,
and explicit favorite browsing retains `list_favorites`.

- The planner searches the authenticated user's favorites first and searches
  outside favorites only when no eligible favorite exists.
- Apply the same ranking within either candidate pool: aim for the lowest
  comparable effective price, prefer discounted products, and compare price per
  kilogram or other matching unit when available. A discounted product should
  not win when it is still substantially more expensive than a comparable
  alternative.
- When candidates remain ambiguous, ask the user to choose rather than silently
  approving one.
- Product selection remains discovery. Adding to the basket still requires the
  existing exact proposal and explicit approval flow.

The meaning of "substantial" and handling for incomparable package units need
real examples before implementation; avoid inventing a complex scoring model
until then.

## User-submitted feature requests

Recognize explicit phrases such as "feature request" or "request feature" and
offer to record the user's request for later development.

The first implementation should store the request text, creation time, and an
open/done status in a simple inspectable backlog, confirm what was recorded, and
never treat logging as authorization to implement it or mutate a Nemlig basket.
Choose the durable storage location when this feature is implemented; do not
collect credentials, basket contents, or other unnecessary account data.

## Future family access

The hosted alpha remains one owner and one Nemlig account. A later release may
allow explicitly invited family members to sign in with their own identity and
link their own Nemlig account. Do not share the owner's credentials, basket,
sessions, proposals, or approvals, and do not build multi-user infrastructure
until a second real user is ready to onboard.
