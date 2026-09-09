## Why

The repository already has a serialized, disabled-first production command, but releases still depend on a local owner token and local recovery evidence. A trusted GitHub Actions entry point needs durable recovery, a sustainable acceptance identity, and truthful separation between service checks, real Nemlig reads, and ChatGPT OAuth acceptance.

## What Changes

- Extend the existing release command for an explicitly dispatched, protected CI release of the exact current CI-green `main` SHA. Preserve local operation and share its cross-host lease.
- Persist a bounded, redacted transition journal remotely before each provider mutation, distinguish run ownership from source SHA, and reconcile cancellation, late success, and provider drift before recovery.
- Make acceptance evidence explicit: repository contracts, anonymous edge, authenticated synthetic service, authenticated live provider, and real ChatGPT user OAuth are different results. Missing required evidence fails the applicable gate; synthetic results never close owner/live-client obligations.
- Recommend a dedicated, narrowly scoped Auth0 machine identity for unattended service acceptance, with isolated synthetic data and no family credential or data access. A machine application is not an Auth0 user and does not prove a user authorization-code flow. Production activation of this identity remains conditional on the identity/cost decision recorded in the design.
- Keep renewable delegated synthetic-user sessions as an alternative requiring safe rotated-token persistence and owner-approved isolated Nemlig account access. Do not store an owner's refresh token in CI.
- Provide bounded Sol/Terra/Luna implementation packets, story readiness gates, owner setup checklist, and evidence needed to finish older pending rollouts.

Owner clarification (2026-09-09): routine releases must not require superuser or owner credentials. Implement the restricted machine path; no owner browser-login helper. First-cutover real-user evidence stays outside CI, and provider activation remains a one-time scoped setup gate.

Goal: a repeatable exact-revision release with verified rollback/recovery and accurately named acceptance results. Done means repository gates, protected CI rehearsal, approved provider setup, one exact production release, required live user/ChatGPT evidence, and archival evidence all pass. Repository implementation alone does not complete the epic.

Non-goals: push/scheduled deployment, preview environments, a second Container, a new paid service, general fixture framework, automatic Auth0 administration, impersonating the owner, browser-password automation, changing onboarding rollout status, or basket/list/favorite/proposal/issue writes. CI never runs mutation acceptance.

Acceptance criteria: untrusted or stale SHAs cannot access deployment credentials; missing protections or acceptance credentials stop before mutation; cross-host/same-SHA runs cannot share ownership; runner loss leaves remotely recoverable evidence and a retained lease; enablement reuses one image and preserves secrets/configuration/cost controls; service identity cannot reach real account state or administrative/mutation tools; success names exactly the evidence collected.

## Capabilities

### New Capabilities

- `nemlig-production-delivery`: Trusted CI invocation, recoverable release ownership, acceptance identity isolation, and distinct production evidence levels.

### Modified Capabilities

None. This capability supplements `nemlig-cloudflare-hosting`. The active `automate-nemlig-production-deployment` change owns its existing hosting delta and uncompleted local rollout; this epic does not rewrite its completed tasks or claim its pending live proof. Its old non-goal of hosted CI explains historical scope, not a second implementation to maintain. Sol reconciles archive order before syncing either change.

## Impact

Likely files: `.github/workflows/`, existing `scripts/production-deploy.ts`, `scripts/production-acceptance.ts`, their `src/` tests, acceptance helpers, and operations/readiness documentation. Conditional synthetic identity work also affects Worker authentication/gateway, HTTP identity/credential selection, and MCP client construction; it must pass its separate readiness gate before delegation.

No runtime edits or provider setup are performed by this proposal. GitHub is public; the coordinator's read-only inspection found no environments and no repository secrets. Auth0 client/grants and Cloudflare CI token permissions are not yet verified. Cost remains one `lite` Container, unchanged quotas/deadlines/sleep/breaker/kill switch. A dispatched release adds bounded hosted CI minutes, remote evidence writes, token issuance, and acceptance traffic; exact plan allowances and acceptable release frequency must be confirmed before activation. See `design.md` and `owner-setup.md`.
