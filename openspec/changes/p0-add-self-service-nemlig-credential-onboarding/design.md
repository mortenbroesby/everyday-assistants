## Context

See `proposal.md` for motivation and the delta specs for observable behavior.
The current schema stores subject, principal key, tier, enablement, and plaintext
Nemlig credentials together inside one encrypted Worker secret. Both the Worker
and the fixed Node Container parse that policy; the Container creates one
principal context and obtains credentials directly from the policy. The Worker
already calls the fixed Container controller Durable Object once for atomic
admission before it forwards an MCP request.

The installed MCP SDK supports URL-mode elicitation, but ChatGPT support must be
capability-detected rather than assumed. The existing Auth0 dynamic client flow
authenticates ChatGPT to the MCP resource; it cannot safely authenticate a
separate browser form and, as a third-party application, cannot use Auth0
Organizations. The current tenant can instead use one Organization for the
separate onboarding web application, subject to a human plan/availability
check. Provider configuration, encryption-key provisioning, credential
migration, the first invitation, and production rollout are human checkpoints.

## Goals / Non-Goals

**Goals:**

- Let an invited user own credential entry, rotation, status, and revocation
  without giving the password to the operator or ChatGPT.
- Bind the organization-aware browser identity and organization-unaware MCP
  identity to the same verified Auth0 subject and accepted principal record.
- Let an exact-email Auth0 invitation create the recipient's Tier 1 principal
  without manual subject copying or a second owner enable step.
- Make rotation and revocation effective on the next MCP request, including an
  already-open session.
- Reuse the existing Worker, Auth0 tenant, fixed controller Durable Object, and
  single Container while adding no package or external storage service.
- Keep migration disabled-first, reversible, bounded, and independently
  observable without secret-bearing evidence.

**Non-Goals:**

- Public self-signup, end-user invitation issuance, user-selected tiers, Nemlig
  password recovery, shared accounts, or selecting another principal.
- Organization-enabling ChatGPT's third-party OAuth client, automating Auth0
  Management API invitations, or adding an email service in the first release.
- Giving the browser direct access to stored ciphertext, Durable Object APIs, or
  the Container.
- Expanding Nemlig mutation behavior or using a basket read/write as credential
  validation.
- Guaranteeing cryptographic erasure from Cloudflare backups; revocation removes
  the active record and encryption-key rotation handles compromise recovery.

## Decisions

### 1. Use native Auth0 invitations with a separate organization-aware web session

`https://nemlig-mcp.broesby.dk/connect` is constant and contains no subject,
token, state, credential, or preauthenticated capability. A new confidential
Auth0 Regular Web Application in the existing EU tenant uses authorization code
with PKCE and an exact Worker callback. It is enabled for one Auth0 Organization;
the owner issues invitations through the Auth0 Dashboard to exact email
addresses. The portal accepts Auth0's `invitation` and `organization` parameters,
passes them to authorization, and accepts enrollment only when Auth0 confirms a
current invitation for the same email and organization. The Worker keeps a
short-lived, server-authenticated, `Secure`, `HttpOnly`, `SameSite=Lax` browser
session and a single-use CSRF value. Invitation tickets are never persisted or
logged by the application.

The verified browser `sub` creates or resumes one accepted principal record.
Later, ChatGPT's organization-unaware dynamically registered client presents the
same authoritative `sub`, which the gateway resolves against that record. This
is preferred over reusing or organization-enabling ChatGPT's third-party client,
and over an application-built invite token because Auth0 already supplies
expiry, exact-email binding, and redemption. The first release deliberately uses
the Dashboard rather than adding a Management API machine client. If native
Organizations are unavailable or require a paid plan, implementation pauses for
a human choice instead of silently building a parallel invitation system.

### 2. Prefer URL elicitation, but make the fixed page independently usable

When a client declares URL elicitation, the MCP server requests the fixed
connection page through that capability. Otherwise a connection-status result
provides non-secret manual navigation guidance. The server never sends form-mode
elicitation for either field. The page authenticates the human again, so copying
the public URL cannot bind a victim's credential to an attacker's session.

This avoids waiting for a ChatGPT-specific feature while still using the MCP
standard when available. The implementation will use the already-installed SDK;
no compatibility shim or new package is needed.

### 3. Split static operator policy from accepted principals and credentials

Principal-policy schema version 2 contains the Tier 0 owner, tier rules, budgets,
revision, Auth0 Organization identifier, and invitation defaults. Accepted
invitees live in principal records inside the existing controller Durable Object,
with subject, random opaque principal key, Tier 1 assignment, status, invitation
metadata, and timestamps. Credentials live in separate records keyed by the
opaque principal key. Unknown Auth0 users cannot create either record.

Issuing an invitation is the owner's explicit conditional Tier 1 grant. Exact-
email redemption creates a pending principal; successful credential validation
and automated isolation prerequisites activate it without a second manual owner
step. The owner retains disable/revoke control, while the invited user controls
only their own Nemlig connection. This removes manual subject copying without
creating public registration or user-selected access.

During migration, the runtime supports the current version-1 owner credential
as an explicit legacy fallback only for that owner. Version 2 never falls back
between principals. The fallback is removed after record-based owner acceptance.

### 4. Use authenticated encryption with explicit binding and rotation

The Worker validates inputs, creates a monotonically increasing generation and a
fresh 96-bit nonce, and encrypts the normalized JSON credential pair using
AES-256-GCM from the platform Web Crypto API. A 32-byte Cloudflare secret is the
key; authenticated additional data includes envelope schema, policy revision,
principal key, and generation. The stored record contains only those non-secret
fields plus nonce and ciphertext. Decryption accepts only the current schema and
configured key version and returns one generic failure class.

This uses the platform implementation rather than a crypto dependency. Passwords
are never normalized or trimmed; the username follows the existing bounded
schema. Key versioning permits deliberate re-encryption later without building a
general key-management framework now.

### 5. Reuse the fixed controller admission operation

Encrypted credential records live beside usage state in the existing fixed
controller Durable Object, under principal-scoped keys. The existing atomic
admission RPC checks enablement, quota, breaker, credential presence, and current
generation together. On admission it returns the small sealed envelope and
generation to the Worker; the Worker replaces any client-supplied internal
headers and forwards that sealed value only over the existing internal Container
request. The Container receives the same key as a secret, verifies/decrypts the
envelope, and binds each MCP session and principal context to its generation.

A missing or changed generation, disabled principal, or revoked principal rejects the next request and closes the obsolete
session. This makes revocation immediate without polling or a second Durable
Object call per request. A separate namespace or database would duplicate the
existing serialized admission boundary and add cost and failure modes.

### 6. Validate before an atomic replace

The connection POST encrypts the candidate in memory and sends it through a
private Worker-to-Container validation route. That route performs one bounded
Nemlig login and one cheapest authenticated read, returns only an allowlisted
outcome, and cannot invoke MCP tools or basket operations. The Worker writes the
new generation only after success. Failure discards the candidate and leaves the
previous generation active.

Validation is disabled independently by `MCP_CREDENTIAL_ONBOARDING_ENABLED`,
bounded by existing total/backend timeouts, and limited conservatively per
principal and globally before Container wake. There is no automatic retry; the
human may retry after a sanitized result.

### 7. Keep the portal server-rendered and deliberately boring

The Worker returns minimal semantic HTML with native username/password inputs,
password-manager autocomplete attributes, no stored-value preload, no third-
party assets or JavaScript, and `Cache-Control: no-store`. CSP, frame denial,
referrer restriction, MIME protection, permissions policy, origin checks,
bounded body parsing, POST-only changes, generic errors, and constant-shape
status responses reduce disclosure and phishing surfaces.

Only credential-present state and non-secret timestamps are displayed. Neither
username nor any masked password fragment is returned, because even partial
values create an unnecessary account-discovery surface.

### 8. Preserve the existing cost envelope

Ordinary MCP requests still make one controller admission call and address at
most the fixed single Container. The sealed envelope adds bounded bytes to that
existing internal request but no extra storage RPC. Portal GETs stop at the
Worker/Auth0 boundary; successful management operations add a small number of
controller reads/writes, and validation attempts are rate-limited before the
Container. There is no polling, alarm, queue, scheduled work, log drain,
keep-awake request, extra namespace, or autoscaling.

Worst credible abuse is therefore bounded by the separate onboarding switch,
per-principal/global validation rates, request deadlines, and the existing one-
Container ceiling. Any plan change or measured usage outside the existing
Cloudflare/Auth0 allowances requires a new human cost decision.

## Risks / Trade-offs

- [A compromised Worker secret can decrypt every active record] -> Keep the key
  separate from stored envelopes, restrict provider access, version it, document
  emergency rotation, and never expose ciphertext through public routes.
- [An Auth0 Organization or its invitation email may be unavailable or paid on
  the current tenant] -> Verify the live tenant and plan at the human checkpoint;
  use the native Dashboard email or generated link only if it adds no cost, and
  require a new design decision otherwise.
- [A second Auth0 application adds configuration drift] -> Use exact issuer,
  organization, callback, logout, grant, and secret checks in the runbook;
  create it only at the human provider checkpoint and record non-secret identifiers.
- [An invitation URL may leak through browser or application telemetry] -> Treat
  it as a short-lived Auth0 capability, pass it only to Auth0, avoid application
  persistence/logging, and reject expired, replayed, wrong-email, or wrong-
  organization redemption.
- [ChatGPT may not advertise URL elicitation] -> Keep the same fixed HTTPS page
  as a manual fallback and verify real client capabilities during acceptance.
- [Credential validation wakes the fixed Container] -> Keep onboarding off by
  default, rate-limit before wake, make one attempt with no retry, and never use
  validation as a health poll.
- [Rotation interrupts an open conversation] -> Reject the obsolete generation
  immediately and return concise reconnect guidance instead of continuing with
  stale credentials.
- [Durable Object point-in-time recovery may retain deleted ciphertext] -> Treat
  deletion as access revocation, document provider retention, and rotate the
  encryption key if cryptographic compromise recovery is required.
- [A dual-read migration fallback could outlive migration] -> Accept legacy
  credentials only for the single owner under schema version 1, test its absence
  in version 2, and make fallback removal an acceptance gate.

## Migration Plan

1. Implement schema-v1 compatibility, schema-v2 credential-free policy parsing,
   encryption envelopes, controller records/admission, portal routes, Container
   generation binding, validation, tests, and operations documentation without
   provider mutation.
2. Run focused tests, strict OpenSpec validation, privacy checks, `pnpm verify`,
   package smoke, and the credential-free Cloudflare dry run; commit, push, and
   require exact-head CI.
3. At the human checkpoint, confirm Auth0 Organizations and invitations are
   available with no new plan or email-provider cost; create one Organization
   and one organization-aware web application, keep the ChatGPT third-party
   client organization-unaware, set exact callbacks, and provision the browser-
   session, OAuth-client, and encryption secrets without recording their values.
4. Record the enabled pre-migration Worker version, deploy the exact commit with
   both `MCP_ENABLED=false` and onboarding disabled, and prove both public routes
   fail closed without Container activity.
5. Enable onboarding only, authenticate as the owner, submit the owner's
   credential directly in the portal, and pass bounded read-only validation.
   Keep the legacy policy secret and rollback target intact.
6. Switch to schema-v2 policy with the owner record, enable MCP, and prove owner
   read-only ChatGPT access, generation rotation, stale-session rejection,
   revocation/reconnect, privacy-safe logs, breaker state, and Container ceiling.
7. At the human checkpoint, issue the boss an exact-email native Auth0 invitation
   through the Dashboard. Have the boss redeem it, create or use their own login,
   store their own credential, and verify account/state isolation. Treat the
   invitation as the owner's conditional Tier 1 grant and activate only after
   credential validation and automated isolation prerequisites pass; then verify
   the same subject works through the organization-unaware ChatGPT client.
8. Remove the version-1 credential fallback only after both principals pass
   acceptance. If any gate fails, disable onboarding and MCP, restore the
   recorded version/policy, and verify owner read-only access before proceeding.
