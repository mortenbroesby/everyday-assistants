# Nemlig Assistant backlog

## Named and reusable shopping lists

**Status:** Implemented for the private owner alpha.

- Named reusable and occasion lists are private, bounded, revision-checked,
  copyable, and recoverable through archive/restore.
- Opening a list is storage-only. Current Nemlig resolution is an explicit,
  favorites-first action for at most twenty selected lines.
- Reusable means easy to invoke again; it does not mean scheduled or automatic.
- The picker uses direct allowlisted Nemlig images with a complete text fallback
  and no image proxy or cache.

Invited-family collaboration remains future work until a second real user is
ready and owner isolation can be designed from that concrete need.

## Favorites-first product selection

**Status:** Core routing implemented. Ordinary find-or-add intent uses the
favorites-first planner, explicit catalog searches retain `find_groceries`,
and explicit favorite browsing retains `show_my_favorites`.

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

## Future family access

The hosted alpha remains one owner and one Nemlig account. A later release may
allow explicitly invited family members to sign in with their own identity and
link their own Nemlig account. Do not share the owner's credentials, basket,
sessions, proposals, or approvals, and do not build multi-user infrastructure
until a second real user is ready to onboard.
