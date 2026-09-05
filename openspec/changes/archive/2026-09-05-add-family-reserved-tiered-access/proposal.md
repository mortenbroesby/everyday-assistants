## Why

The hosted Nemlig Assistant currently recognizes one owner and applies one global
usage budget. Before any invitee can be enabled, the Worker must reject unknown
identities cheaply, reserve capacity for the family, and prove that every
principal's Nemlig account and private state remain isolated.

## What Changes

- Add three ascending access tiers: Tier 0 family, Tier 1 trusted invitees, and
  Tier 2 experimental access, with higher-numbered tiers shed first.
- Keep the identity-to-tier and per-principal Nemlig configuration private,
  encrypted, owner-controlled, and changeable without a code build.
- Enforce identity admission, per-principal rate limits, tier budgets, and
  family-reserved capacity at the Worker before Durable Object dispatch or
  Container wake.
- Keep the existing global kill switch, one-Container maximum, global breaker,
  hard quotas, bounded retries, and deadlines authoritative over every tier.
- Isolate upstream sessions, baskets, proposals, approvals, favourites, plans,
  and named lists by authenticated principal; no family credential or state may
  be shared with an invitee.
- Emit only bounded aggregate tier evidence and stable non-sensitive denials.
- Ship the policy disabled for invitees. Adding a principal or credential,
  changing production configuration, and inviting a user remain explicit owner
  actions.
- Do not add a service, scheduled job, background worker, paid log drain,
  Container instance, or higher quota. If implementation cannot preserve the
  current maximum cost envelope, stop for owner review.

## Capabilities

### New Capabilities

- `nemlig-tiered-access`: Private tier assignment, family-reserved admission,
  per-principal isolation, predictable shedding, and bounded aggregate evidence.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Replace the single-owner-only gateway contract
  with an allowlisted multi-principal contract while preserving authentication
  before wake and every existing global safety ceiling.
- `nemlig-chatgpt-integration`: Replace the stale single-owner expansion guard
  with the approved private-principal policy while retaining owner-only defaults,
  explicit activation, and the prohibition on public access.

## Impact

- Affects Worker authentication, admission state, Container request forwarding,
  upstream session selection, proposal binding, list ownership, production
  acceptance, configuration validation, tests, and operating documentation.
- Uses the existing Worker, Durable Objects, fixed `lite` Container, Auth0 API,
  and encrypted Worker-secret boundary. Invitee configuration is absent by
  default, so current owner behavior remains compatible.
- Adds no dependency or provider. The worst credible cost case remains the
  existing global 5,000-operation and 500-expensive-operation daily ceilings;
  multiple users can consume those ceilings sooner but cannot raise them.

## Non-goals

- Public registration, self-service invitations, shared household credentials,
  horizontal scaling, automatic spending-based billing actions, or guarantees
  during provider outages or emergency shutdown.
- Checkout, payment, order placement, delivery-slot changes, or any unreviewed
  Nemlig basket mutation.

## Acceptance Criteria

- Tier 0 retains an explicit reserve that Tier 1 and Tier 2 cannot consume, and
  Tier 2 is denied before Tier 1 as configured headroom declines.
- Unknown, disabled, malformed, or incompletely configured principals fail
  before Durable Object dispatch, Container wake, or Nemlig access.
- Every admitted request uses only that principal's credentials and private
  state, including mutation proposals and their approval/readback lifecycle.
- Concurrent admission is atomic; period reset and owner configuration changes
  are predictable; the global breaker and kill switch still override all tiers.
- Tests and production evidence prove denial-before-wake, isolation, unchanged
  capacity and quotas, aggregate-only observability, and owner-only default
  behavior without mutating a Nemlig basket.
