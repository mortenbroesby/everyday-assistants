## Context

See proposal.md and #151. Current main is `85bcd7ee3d09`. The gateway applies
global normal/expensive minute gates and private principal-minute gates; the
credential portal separately persists minute validation windows. These are
distinct from the daily breaker and principal monthly cost allowance.

## Goals / Non-Goals

Delete the three throttle paths and their dead configuration. Keep atomic usage
accounting and every unrelated safety boundary. Do not change the viewer,
provider search, platform quotas, retries, infrastructure capacity or live secrets.

## Decisions

Burst verification reproduced a pre-existing CSRF replay defect: truncating the
consumed-token history to 32 entries admitted an old still-valid credential
action after 65 submissions. Preserve the existing per-principal hashed record
and expiry cleanup, but retain every consumed token until its signed expiry.
No polling, new namespace or compatibility path is needed. Record size grows
with authenticated credential actions in the 15-minute lifetime; platform
storage failure must fail closed before provider work, not forget live tokens.

- Delete gates rather than raise constants, add bypass switches or infinite
  sentinels. Keep minute usage telemetry only where it reports actual activity,
  not fictional rate headroom. Monthly rejection gets a cost-specific reason.
- Remove rate fields from strict policy/configuration schemas and deployment
  candidate bindings. No silent compatibility projection. Existing persisted
  usage counts remain readable; no destructive storage cleanup is required.
- Credential validation remains authenticated, authorized, CSRF single-use,
  encrypted and provider-verified; remove the validation-window storage helper
  and misleading `limited` portal outcome.
- This is a breaking private configuration contract and gets a major package
  version/reviewed release note. The viewer HTML/resource identity is unchanged.

## Risks / Trade-offs

- Higher authenticated bursts can saturate the fixed Container or consume daily
  budget faster. Retain bounded hydration, timeouts, one instance, atomic daily
  and monthly cost admission, and kill switch. No new queue/retry/polling.
- Credential-validation bursts are no longer minute-capped and do not inherit
  MCP useful-operation accounting; a compromised allowed identity can generate
  additional provider-login attempts and traffic. OAuth/authorization, CSRF,
  bounded form/body size and deadlines remain, but this does not guarantee zero
  abuse or a billing hard cap. Review this risk before production approval.
- Current model: 60 normal/10 expensive global operations per minute plus
  principal and credential minute caps. Proposed model: no app throughput caps;
  MCP retains 5,000 useful/500 expensive daily defaults and existing monthly
  allowance. Worst credible failure is repeated authenticated work exhausting
  those budgets rapidly, plus repeated authorized portal validations and public
  auth/log traffic. Cheaper alternatives were higher caps or pacing read-only
  work; the owner explicitly chose deletion. No cost is incurred by this PR's
  local mocked tests; no production activation is authorized.

## Migration Plan

Before any separately approved release, stage the private principal-policy
document with its minute fields removed and unchanged identities, credentials,
monthly allowances and revision lineage. Preserve old configuration privately
for rollback. Review obsolete plaintext-variable removal with the candidate
configuration. Do not perform that secret/configuration transition in this task.
An unchanged old strict policy must fail closed, not run unbounded accidentally.
Rollback requires the recorded prior code and compatible private configuration;
never discard credential records or usage accounting to roll back.
