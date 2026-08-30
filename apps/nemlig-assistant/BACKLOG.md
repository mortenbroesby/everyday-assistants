# Nemlig Assistant backlog

## Favorites-first product selection

Treat requests to find or add an item as product-search intent.

- Search the authenticated user's favorites first. If one or more suitable
  favorites exist, select from them even when external search might find other
  candidates. Search outside favorites only when no favorite is suitable.
- Apply the same ranking within either candidate pool: aim for the lowest
  comparable effective price, prefer discounted products, and compare price per
  kilogram or other matching unit when available. A discounted product should
  not win when it is still substantially more expensive than a comparable
  alternative.
- When the price difference is not substantial, use the best plausible match
  for the user's request. Ask the user to choose when the remaining candidates
  represent meaningfully different products or the guess would be unsafe.
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

## Epic: replace the local tunnel with a hosted service

**Status:** Backlog; feasibility and implementation are not yet approved.

**Goal:** let the ChatGPT app remain available without depending on the owner's
laptop, local MCP process, or long-lived tunnel, while preserving the current
shopping safety contract.

### Decision gate

- [ ] Confirm that Nemlig's technical and policy constraints permit the intended
  hosted use. Stop if a compliant design is not possible.
- [ ] Decide whether the service is for one household or multiple users; do not
  build multi-user infrastructure without a real need.
- [ ] Compare the smallest viable hosting options, expected cost, availability,
  regional/data-residency needs, and operational burden.
- [ ] Choose Auth0 or another standards-based OAuth/OIDC provider only after the
  identity, ChatGPT MCP, and hosting requirements are known.
- [ ] Approve the architecture, security boundary, ongoing cost, and migration
  plan before implementation begins.

### Workstreams

- [ ] Replace the local stdio/tunnel boundary with an authenticated hosted
  Streamable HTTP MCP endpoint while retaining the existing tool contracts.
- [ ] Authenticate each ChatGPT user and explicitly link that identity to the
  intended Nemlig account. Provide unlinking and revocation.
- [ ] Store Nemlig credentials and service secrets in a managed secret store;
  never expose them to ChatGPT, logs, source control, or client configuration.
- [ ] Isolate sessions, baskets, approvals, and proposal state by user/account.
  Keep prepare/apply, expiry, revalidation, single-use, and readback guarantees.
- [ ] Add least-privilege authorization, rate limiting, privacy-safe audit
  events, health checks, deployment/version evidence, alerts, backup where
  state requires it, and a tested rollback path.
- [ ] Automate tested deployments from an approved commit. A failed deployment
  must not replace the last healthy version.
- [ ] Update the ChatGPT app connection and document account linking, support,
  credential rotation, incident response, and service shutdown.

### Cutover acceptance

- [ ] Read-only search, favorites, and basket inspection work while the laptop
  and local tunnel are off.
- [ ] Two test identities cannot access each other's Nemlig account, basket,
  proposals, or audit data.
- [ ] Exact approval is still required before every basket mutation, with no
  checkout, payment, order, or delivery-slot capability.
- [ ] Credential revocation, account unlinking, deployment rollback, and service
  shutdown are demonstrated before the local tunnel is retired.
- [ ] Run both paths during a short validation period, then remove the tunnel
  only after an explicit cutover decision.

Until this epic is approved and its acceptance criteria pass, the managed local
tunnel remains the supported setup.
