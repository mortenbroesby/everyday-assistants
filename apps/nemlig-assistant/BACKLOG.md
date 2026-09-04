# Nemlig Assistant backlog

## P0 — restore reliable ChatGPT reconnect and add bounded observability

**Status:** Active incident. Track and complete
[GitHub issue #6](https://github.com/mortenbroesby/everyday-assistants/issues/6)
before further demo-dependent feature work.

- Reproduce and identify the exact failing boundary in the expired ChatGPT OAuth
  reconnect flow. The Worker, Auth0 discovery, OAuth resource metadata, and
  authenticated read-only tools are currently responsive, so the remaining
  root cause must not be attributed to the backend without evidence.
- Restore and prove a fresh connection through the one existing Nemlig Assistant
  app, including two successful read-only ChatGPT acceptance runs.
- Add redacted structured Worker logs with correlation IDs and clear boundary
  outcomes for the kill switch, authorization, Durable Object dispatch, upstream
  calls, circuit-breaker changes, and deployment identity.
- Keep the generous final 90-second request ceiling, 85-second Container
  ceiling, and 60-second Nemlig interaction window so slow catalogue work can
  finish while a genuinely stalled request still terminates clearly.
- Keep retries bounded and mutation-safe. Preserve the kill switch, circuit
  breaker, quotas, approval envelopes, and fail-closed behavior.
- Bound observability cost with sampling, short retention, field-size limits,
  and no payload duplication. Review the cost model and sensitive-field
  redaction before production enablement.
- Deploy disabled first, verify fail-closed behavior, enable the same version,
  and rerun anonymous-edge plus authenticated read-only production acceptance.
- Remove the inactive legacy Mac tunnel services only after the cloud-only path
  is verified.

This item does not authorize any Nemlig basket mutation.

## Named and reusable shopping lists

**Status:** Implemented for the private owner alpha.

- Named reusable and occasion lists are private, bounded, revision-checked,
  copyable, and recoverable through archive/restore.
- Opening a list is storage-only. Current Nemlig resolution is an explicit,
  catalogue-backed action for at most twenty selected lines.
- Reusable means easy to invoke again; it does not mean scheduled or automatic.
- The picker uses direct allowlisted Nemlig images with a complete text fallback
  and no image proxy or cache.

Invited-family collaboration remains future work until a second real user is
ready and owner isolation can be designed from that concrete need.

## Catalogue-first product selection

**Status:** Core routing implemented. Ordinary find-or-add intent uses the
catalogue-backed planner with short, loose Danish wording. Direct catalogue
search retains `find_groceries`, and favourite browsing remains explicit via
`show_my_favorites`.

- The planner searches current catalogue inventory for every ordinary line and
  never loads favourites implicitly.
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
