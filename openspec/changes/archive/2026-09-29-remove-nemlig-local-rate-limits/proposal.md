## Why

Private household shopping does not need request throttles, expensive-operation
classes or family/guest tiers. The owner clarified that removing minute gates
alone leaves unwanted complexity. This remains one reviewable family-only PR,
not a diagnosis or bypass of ChatGPT, Cloudflare or Nemlig limits.

## What Changes

- Delete all app request-rate gates and normal/expensive classifications,
  separate expensive caps/counters, user tiers, reserves, shedding, forecasts,
  per-person budgets and tier reporting/configuration.
- Delete the remaining daily ceiling, persisted usage/breaker accounting and
  obsolete usage/reset endpoints. Keep the manual kill switch,
  authentication, CSRF, account isolation, fixed capacity, bounded work and exact
  protected basket approval. Protocol traffic and
  credential-free profile handling remains a security distinction, not pricing.
- **BREAKING**: use one current strict private policy for configured family
  identities, explicit owner and existing encrypted credentials, without old
  policy versions, inline passwords, obsolete budget/tier fields or shims.
- Verify unlimited app-local bursts, owner authorization,
  isolation and unchanged protected writes. No production/configuration change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: remove request throttles and expensive-operation
  splitting and daily admission quotas; retain non-quota safety boundaries.
- `nemlig-tiered-access`: retire tier admission, reserves, forecasts and budgets;
  preserve private identity authorization, owner controls and account isolation.
- `nemlig-chatgpt-integration`: family expansion keeps isolation/activation
  requirements without obsolete tier or quota prerequisites.

## Impact

Issue #151 is the work contract. One branch `codex/nemlig-remove-local-rate-limits`
and one reviewable PR contain this change. No UI/resource, provider, framework,
deployment, credential or real-basket change belongs here. Removing throttles
permits higher authenticated bursts and credential-validation attempt volume,
and removes every daily/expensive/monthly budget; there is no app-enforced
operation or billing ceiling. The PR
documents that trade-off and the private configuration transition needed
before a separately authorized release. Native historical-card work stays in
#137 and is not acceptance evidence for this policy change.
