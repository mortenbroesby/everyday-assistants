## Why

Invited users currently cannot enroll themselves or provide and rotate their own Nemlig credentials: the operator must manually copy an Auth0 subject into policy and place every username and password inside one Cloudflare secret. That forces unsafe credential handoff and brittle identity setup, so the private tiered-access design cannot safely enable the user's boss.

## What Changes

- Let the owner record one short-lived exact-email invitation in the existing controller, then share the fixed connection URL so the recipient can create or use their own Auth0 login and enroll as a default Tier 1 principal without manual subject copying.
- Add an invite-only browser flow at the existing Nemlig MCP origin where an accepted Auth0 principal can enter, replace, or delete only their own Nemlig credential pair.
- Use MCP URL-mode elicitation when the connected client advertises support, with a fixed non-secret `/connect` URL and clear manual fallback when it does not; never collect credentials through ChatGPT or MCP form-mode elicitation.
- Validate a submitted credential pair with one bounded, read-only Nemlig authentication check before atomically replacing the stored record; a failed rotation retains the last working record.
- Remove Nemlig credential pairs and invitee identities from the shared principal policy. Keep the Tier 0 owner, tier rules, budgets, and invitation defaults static; store pending invitation digests and accepted invitee principals in the existing controller Durable Object.
- Encrypt each principal's credentials with a versioned authenticated-encryption envelope under a separately managed Cloudflare secret and store only ciphertext in a principal-scoped record inside the existing fixed controller Durable Object.
- Treat owner issuance of an invitation as the explicit conditional Tier 1 grant: exact-email redemption, successful credential validation, and isolation gates activate access without a second subject-copy or enable step; retain owner-only disable and revocation.
- Add self-service status, rotation, and credential revocation without revealing stored values, plus sanitized and rate-limited failure handling that preserves the global kill switch, auth-before-wake, quotas, breaker, bounded retries, one-Container ceiling, and basket approval contract.
- Add a disabled-first migration that copies and verifies the existing owner's credential without exposing it, retains an immediate rollback path, and requires explicit human checkpoints before Auth0 configuration, Cloudflare bindings/secrets, production migration, or any material cost change.

Non-goals: public or uninvited signup, arbitrary account mapping, user-selected tiers, shared Nemlig credentials, password recovery, checkout or ordering, basket mutation during validation, Auth0 Organizations, changing the third-party ChatGPT OAuth client, building a Management API invitation service or adding an email provider, secret-bearing invitation URLs, replacing Auth0, adding a database vendor or paid secret manager, autoscaling, or changing the existing ChatGPT app identity.

Acceptance requires synthetic security and isolation tests, a credential-free production dry run, exact-head CI, an owner-controlled Auth0 and Cloudflare setup checkpoint, disabled-first deployment, successful owner migration, one short-lived exact-email invitation and self-enrollment, automatic conditional Tier 1 activation only after credential and isolation gates, one invited-user read-only login and shopping-list check, owner disable plus credential revocation readback, and proof that no credential appears in ChatGPT, URLs, logs, responses, fixtures, Git, or observability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Add owner-issued exact-email invitation redemption, subject-bound self-enrollment, conditional Tier 1 activation, and out-of-band Nemlig credential onboarding, rotation, status, and revocation while prohibiting credentials in ChatGPT.
- `nemlig-cloudflare-hosting`: Add an invitation-gated dynamic principal registry, encrypted per-principal credential storage, bounded read-only validation, migration and rollback requirements, and cost/privacy controls for the browser onboarding surface.

## Impact

Affected areas include the principal-policy schema, one Auth0 Free browser-application configuration, Cloudflare Worker routes and security headers, pending-invitation, accepted-principal, and credential records in the existing fixed controller Durable Object, Container credential resolution, MCP connection guidance, deployment validation and operations documentation, and focused security/acceptance tests. The installed MCP SDK already includes URL-mode elicitation, so no new package is expected. The existing ChatGPT dynamically registered third-party OAuth client remains unchanged and uses the same authoritative subject. Admission carries the current encrypted credential generation through the existing controller call, avoiding another per-request storage round trip; invitation creation/acceptance, onboarding, rotation, disable, and revocation add only rare writes. The owner shares the fixed public connection URL through an existing channel after recording the exact invitee email; no email provider, Management API client, or secret-bearing invitation URL is introduced. The change adds no namespace, polling, keep-awake work, autoscaling, recurring job, dependency, paid plan, or third-party service. Provider setup, secret provisioning, migration, the first invitation, and production deployment remain explicit human checkpoints.
