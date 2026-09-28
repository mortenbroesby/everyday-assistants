## Why

Private household shopping should not be interrupted by app-owned request-rate
throttles. The owner explicitly requests their removal in a reviewable PR;
this is not a diagnosis or bypass of ChatGPT, Cloudflare or Nemlig limits.

## What Changes

- Remove normal/expensive MCP, principal-minute and credential-validation
  request-rate gates, their configuration and their rejection paths.
- **BREAKING**: remove obsolete minute-limit policy/configuration fields; no
  compatibility limiter, unbounded numeric sentinel or live secret migration.
- Keep daily/monthly cost ceilings, emergency breaker, authentication, CSRF,
  isolation, bounded work, fixed capacity and protected basket writes.
- Prove admitted bursts beyond former limits and unchanged remaining safeguards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: remove short-window and credential throttling,
  obsolete settings and rate-denial reporting while retaining cost controls.
- `nemlig-tiered-access`: retain equal monthly allowances and accounting but
  remove principal-minute admission thresholds.

## Impact

Issue #151 is the work contract. One branch `codex/nemlig-remove-local-rate-limits`
and one reviewable PR contain this change. No UI/resource, provider, framework,
deployment, credential or real-basket change belongs here. Removing throttles
permits higher authenticated bursts and credential-validation attempt volume;
the PR documents that trade-off and the private configuration transition needed
before a separately authorized release. Native historical-card work stays in
#137 and is not acceptance evidence for this policy change.
