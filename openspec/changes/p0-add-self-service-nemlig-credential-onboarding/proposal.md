## Why

Invited users currently cannot provide or rotate their own Nemlig credentials: the operator must place every username and password inside one Cloudflare secret. That forces unsafe credential handoff and makes reliable self-service onboarding impossible, so the private tiered-access design cannot safely enable the user's boss.

## What Changes

- Add an invite-only browser flow at the existing Nemlig MCP origin where an Auth0-authenticated principal can enter, replace, or delete only their own Nemlig credential pair.
- Use MCP URL-mode elicitation when the connected client advertises support, with a fixed non-secret `/connect` URL and clear manual fallback when it does not; never collect credentials through ChatGPT or MCP form-mode elicitation.
- Validate a submitted credential pair with one bounded, read-only Nemlig authentication check before atomically replacing the stored record; a failed rotation retains the last working record.
- Remove Nemlig credential pairs from the shared principal policy. Keep subject, opaque principal key, tier, enablement, budgets, and owner activation under operator control.
- Encrypt each principal's credentials with a versioned authenticated-encryption envelope under a separately managed Cloudflare secret and store only ciphertext in a principal-scoped record inside the existing fixed controller Durable Object.
- Add self-service status, rotation, and revocation without revealing stored values, plus sanitized and rate-limited failure handling that preserves the global kill switch, auth-before-wake, quotas, breaker, bounded retries, one-Container ceiling, and basket approval contract.
- Add a disabled-first migration that copies and verifies the existing owner's credential without exposing it, retains an immediate rollback path, and requires explicit human checkpoints before Auth0 configuration, Cloudflare bindings/secrets, production migration, or any material cost change.

Non-goals: public signup, arbitrary account mapping, shared Nemlig credentials, password recovery, checkout or ordering, basket mutation during validation, replacing Auth0, adding a database vendor or paid secret manager, autoscaling, or changing the existing ChatGPT app identity.

Acceptance requires synthetic security and isolation tests, a credential-free production dry run, exact-head CI, an owner-controlled Auth0 and Cloudflare setup checkpoint, disabled-first deployment, successful owner migration, one invited-user read-only login and shopping-list check, rotation and revocation readback, and proof that no credential appears in ChatGPT, URLs, logs, responses, fixtures, Git, or observability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Add invite-only, Auth0-bound, out-of-band Nemlig credential onboarding, rotation, status, and revocation while prohibiting credentials in ChatGPT and preserving explicit owner activation.
- `nemlig-cloudflare-hosting`: Add encrypted per-principal credential storage, bounded read-only validation, migration and rollback requirements, and cost/privacy controls for the browser onboarding surface.

## Impact

Affected areas include the principal-policy schema, Auth0 browser application configuration, Cloudflare Worker routes and security headers, principal-scoped records in the existing fixed controller Durable Object, Container credential resolution, MCP connection guidance, deployment validation and operations documentation, and focused security/acceptance tests. The installed MCP SDK already includes URL-mode elicitation, so no new package is expected. Admission carries the current encrypted credential generation through the existing controller call, avoiding another per-request storage round trip; onboarding, rotation, and revocation add only rare writes. The change adds no namespace, polling, keep-awake work, autoscaling, recurring job, dependency, or third-party service. Provider setup, secret provisioning, migration, activation, and production deployment remain explicit human checkpoints.
