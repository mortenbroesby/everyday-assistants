## 1. Feasibility and External-Resource Gate

- [x] 1.1 Document the current authoritative Nemlig technical/policy constraints
  relevant to one-household hosted credential use, record unresolved risk without
  presenting legal certainty, and verify `design.md` names a stop condition for
  every incompatible or unknown constraint.
- [x] 1.2 Compare the smallest qualifying EU container hosts and OAuth/OIDC
  providers against always-on Node 22, single-replica enforcement, ChatGPT MCP
  compatibility, managed secrets, durable snapshots, health, rollback, alerts,
  and recurring cost; record one recommended pair and verify no provider
  abstraction or resource has been added.
- [x] 1.3 **[OPERATOR]** Review and explicitly approve the Auth0 Europe tenant,
  Free-plan boundary, one-owner identity model, and credential-free OAuth staging.
  Verify no payment method or paid Auth0 plan is active.
- [ ] 1.4 Prove Auth0's credential-free OAuth flow through the existing Secure MCP
  Tunnel supports ChatGPT discovery, authorization code with PKCE, owner
  identification, required scope, protected-resource metadata, and refresh/offline
  access; verify revoked, expired, wrong-audience, and wrong-subject tokens fail
  before tool dispatch.
- [ ] 1.5 **[OPERATOR]** After the authenticated tunnel milestone, compare and
  explicitly approve a host, region, recurring cost ceiling, managed-secret and
  durable-storage boundary before any hosting endpoint, secret, or billable
  resource is created.

## 2. Transport-Neutral Runtime

- [x] 2.1 Refactor the current MCP construction into a transport-neutral factory
  while retaining the stdio entry point; verify existing MCP, interface, smoke,
  picker, and proposal tests pass without changed tool contracts.
- [ ] 2.2 Add an authenticated-owner and MCP-session request context that cannot be
  supplied through tool arguments; verify focused tests reject a mismatched owner
  or session before proposals or Nemlig calls are reached.
- [ ] 2.3 Add the reusable Streamable HTTP entry point using the installed MCP SDK,
  minimal Node HTTP support, loopback-only binding for tunnel use, permitted-origin
  validation, and sanitized errors;
  verify protocol tests cover initialize, tool enumeration, POST/GET lifecycle,
  invalid origin, malformed requests, and unauthenticated rejection.
- [ ] 2.4 Add HTTP-only health, readiness, revision, and OAuth protected-resource
  metadata endpoints; verify responses contain the exact build revision and no
  credential, token, storage path, account identity, plan, proposal, or basket.
- [ ] 2.5 Compare stdio and authenticated HTTP tool/resource metadata from the same build and
  verify names, schemas, annotations, resource URIs, and instructions match except
  for documented transport-only endpoints.
- [ ] 2.6 Point a separate local tunnel profile at the loopback HTTP endpoint,
  update supervision and the operating guide without storing Auth0 or tunnel
  secrets, and verify the current stdio-target profile remains a recoverable
  fallback until the owner approves the switch.

## 3. Hosted Identity, Secrets, and Safety State

- [ ] 3.1 Implement issuer, audience, signature, expiry, scope, and configured-owner
  token validation for every HTTP deployment using Auth0's supported path; verify synthetic
  authorization tests cover valid owner, wrong owner, revoked/expired token,
  missing scope, invalid signature, and unavailable metadata without contacting
  Nemlig.
- [ ] 3.2 Add a hosted credential resolver backed only by the approved managed
  secret reference while preserving local credential resolution; verify synthetic
  tests cover secret absence, malformed values, rotation, sanitized failures, and
  zero secret material in outputs or logs.
- [ ] 3.3 Bind hosted basket proposals to the validated owner and originating MCP
  session while retaining local connection binding; verify proposal tests reject
  cross-session use, preserve serialization and exact revalidation, and fail a
  post-restart apply closed without mutation or retry.
- [ ] 3.4 Emit bounded authentication, health, deployment, proposal-state, and
  sanitized upstream events with non-secret correlation IDs; verify log-capture
  tests find no prompt, credential, cookie, token, authorization header, internal
  session identifier, full plan, proposal review, or basket contents.

## 4. Durable Hosted Plan Snapshots

- [ ] 4.1 Extract the existing plan snapshot operations behind the smallest storage
  contract needed by the local filesystem and hosted storage implementations;
  verify all current local permission, immutability, validation, and traversal
  tests remain unchanged and pass.
- [ ] 4.2 Implement the approved host's durable encrypted snapshot storage with
  opaque IDs, exclusive creation, owner binding, schema validation, and uniform
  not-found responses; verify synthetic tests cover save/load, collision, wrong
  owner, missing, malformed, and backend failure without leaking storage details.
- [ ] 4.3 Route hosted save/load through durable storage and local save/load through
  owner-only files; verify both paths re-resolve current product, availability,
  price, and basket data and neither path prepares or applies a basket mutation.

## 5. Container and Deployment Pipeline

- [ ] 5.1 Add the minimal production container and hosted start command for the
  package's pinned Node 22 runtime, non-root execution, graceful shutdown, and
  immutable build revision; verify a local container smoke test reaches health,
  readiness, OAuth metadata, and unauthenticated MCP rejection without secrets.
- [ ] 5.2 Add provider configuration for one EU region and exactly one active
  replica with managed secret and snapshot references, health checks, bounded
  resources, and no committed secret values; verify configuration validation and
  repository privacy checks pass.
- [ ] 5.3 Add CI that runs `pnpm verify`, strict OpenSpec validation, hosted contract
  and container smoke tests, and secret scanning before building one immutable
  revision-addressed image; verify a failing gate cannot publish or deploy it.
- [ ] 5.4 Add explicit staging deployment and manual production promotion of the
  same verified image, post-deployment checks, recorded commit/image digest, and
  last-healthy rollback; verify a deliberately failed staging health check never
  promotes or replaces the healthy release.
- [ ] 5.5 Apply the Nemlig runtime feature version bump required by repository
  policy and verify the release plan and `check:version-bump` accept the hosted
  runtime diff while npm publication remains disabled.

## 6. Operations and Documentation

- [ ] 6.1 Configure privacy-safe health, availability, authorization-failure, and
  indeterminate-proposal alerts with bounded retention; trigger each synthetic
  condition and verify the alert contains revision and event class but no secret
  or shopping content.
- [ ] 6.2 Document owner connection, secret rotation, OAuth revocation, snapshot
  handling, incident response, deployment evidence, rollback, and full service
  shutdown; verify every procedure has a readback step and none prints or embeds
  credentials.
- [ ] 6.3 Update the Nemlig README feature-set inventory, hosted operating guide,
  app instructions, and backlog to distinguish shipped hosting from the retained
  tunnel fallback; verify planned behavior is not listed as shipped before its
  acceptance checks pass.
- [ ] 6.4 Review all hosted outputs, fixtures, container layers, CI artifacts,
  deployment configuration, and logs for secrets or personal data and verify the
  repository privacy check plus a scoped manual audit find none.

## 7. Staging, Production, and Cutover

- [ ] 7.1 Deploy credential-free staging from an exact verified commit and verify
  health, readiness, revision, OAuth discovery, authenticated metadata parity,
  rejection cases, restart behavior, and rollback without a live Nemlig account.
- [ ] 7.2 **[OPERATOR]** After reviewing staging evidence, explicitly approve
  production resource creation, owner identity binding, managed Nemlig credential
  provisioning, and the accepted recurring cost before production secrets or
  endpoints are created.
- [ ] 7.3 Deploy the approved immutable image to production, connect a separate
  private hosted ChatGPT app, turn off the Mac tunnel, and verify read-only search,
  favorites, guided planning, snapshots, and basket inspection work against the
  configured owner account without exposing secrets.
- [ ] 7.4 Demonstrate wrong-owner rejection, authorization revocation and restore,
  Nemlig credential rotation, process restart with pending-proposal refusal,
  failed-release rollback, last-healthy restore, and service shutdown; verify no
  demonstration performs or retries an unapproved basket mutation.
- [ ] 7.5 Hand off a bounded owner alpha exercise comparing tunnel and hosted tool
  contracts and read-only behavior, with an optional separately reviewed and
  explicitly approved exact basket proposal; record discrepancies as follow-up
  work without weakening validation or approval rules.
- [ ] 7.6 **[OPERATOR]** Make the explicit cutover or rollback decision after the
  bounded dual run; retire and revoke the tunnel only if cutover is approved, then
  verify the selected ChatGPT path works and the retired path no longer connects.

## 8. Final Verification and Delivery

- [ ] 8.1 Run strict validation for this change, focused hosted/package checks, and
  root `pnpm verify`; resolve every failure without live mutation, checkout,
  payment, order, or delivery-slot capability.
- [ ] 8.2 Review the final implementation against every delta-spec scenario and
  design decision, verify the single-replica and external-resource gates remain
  enforced, and record any deliberate deferral with its trigger.
- [ ] 8.3 Commit the completed scoped implementation to `main`, push it, verify
  `origin/main` equals the reported commit, and verify exact-head CI plus deployed
  revision evidence before handoff.
- [ ] 8.4 Archive the OpenSpec change only after all non-operator work and the
  selected operator cutover or rollback path are complete, then verify active and
  main specifications reflect the delivered behavior.
