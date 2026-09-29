## Context

See proposal.md and #151/#152. Reviewed baseline `85bcd7ee3d09`; reconciled main
`cc2ffdcbf0f3`. Initial minute-gate removal retained daily/expensive/tier
machinery. The owner clarified all app-local limiting and compatibility should
go. Earlier-head CI is not evidence for this final contract.

## Goals / Non-Goals

Delete unnecessary usage policy, not authentication or provider-write safety.
No UI/framework, identity-provider change, production operation or real basket write.

## Decisions

- Delete every minute/day/month usage gate, class budget, tier, reserve,
  forecast, counter and usage/reset endpoint. Do not replace these with infinite
  values, adapters or unused schemas. Keep protocol/profile/useful distinctions
  only for credential gating and sanitized diagnostics; all shopping is equal.
- One strict private policy (`schema_version: 3`): revision, explicit
  `owner_subject` and bounded enabled family identities/opaque keys. No old
  versions, tier/budget/organization/invitation/inline-password fields or dynamic
  unknown-identity fallback.
- Reuse the existing independent encrypted credential records/envelopes, exact
  key/revision/generation binding, disable/revoke and account/conversation
  isolation. Owner-only credential management is a security privilege, not a tier.
- Enumerate current configured members for owner management, storing status by
  their exact configured subject/key. Credential commit atomically rechecks
  disable/revoke decisions; no separate post-validation enable can undo them.
  Remove unused dynamic invitation registration/indexing rather than preserve a
  second enrollment path. Credential-free profile discovery must not evict an
  active shopping context; real credential rotation still invalidates old state.
- Leave obsolete stored usage untouched and unread. Removing a gate does not
  authorize deleting durable data or deploying old policy/configuration.
- Retain consumed CSRF hashes until their signed expiry; storage failure denies
  before provider work. No eviction-based replay vulnerability or polling.
- Same PR, existing major `5.0.0` release note. No second admission workflow.

## Risks / Trade-offs

There is no app-enforced operation or billing ceiling. A runaway authenticated
loop can generate repeated provider reads, log/storage traffic and cost until
manually stopped. One fixed Container, deadlines, bounded hydration/retries and
manual kill switches limit individual work but do not cap aggregate traffic.
These remaining controls are not presented as equivalent to the removed limits.
External provider/platform rate limits still apply; no bypass is implemented.

Credential validation and short-lived CSRF replay history can grow with allowed
authenticated requests; persistence failures remain fail closed.

## Migration Plan

Before separately authorized release, privately stage exact family identities,
keys and explicit owner in the current strict policy. Preserve encrypted
credentials, revision lineage and private rollback configuration. Migrate any
inline credentials using the existing protected onboarding only with approval.
Remove every obsolete rate/daily/expensive binding; stale deployment bindings
must fail validation rather than be projected away. No live transition occurs
in this PR. Prior-code rollback needs its own compatible private configuration;
current code contains no legacy parser, replay or restored submission authority.
