## 1. Contract and Baseline

- [x] 1.1 Rebase the isolated worktree onto current `origin/main`, confirm `fix-nemlig-oauth-reliability` and sibling work remain unchanged, and verify the branch/root/base/status evidence is clean
- [ ] 1.2 Revise synthetic schema-v2 policy fixtures to keep only the static Tier 0 owner, tier budgets, and invitation defaults while retaining a single-owner schema-v1 migration fixture; verify strict parsing rejects credentials, Organization configuration, dynamic invitees, duplicate identity, unsafe keys, and invalid tier ordering in static policy
- [x] 1.3 Record the bounded cost model and implementation file map before code changes; verify the design adds no dependency, Durable Object namespace, Container, autoscaling, polling, scheduler, queue, or paid service

## 2. Credential Envelope and Principal Records

- [x] 2.1 Implement the bounded versioned credential-envelope schema and Web Crypto AES-256-GCM helpers with principal key, policy revision, key version, and generation as authenticated data; verify round-trip, tamper, wrong-principal, wrong-generation, malformed-size, and wrong-key tests
- [ ] 2.2 Add bounded pending-invitation create/read/cancel/consume operations plus accepted-principal and principal-scoped credential operations to the existing fixed controller storage; store only a domain-separated keyed exact-email digest, opaque invitation id, status, and seven-day expiry, and verify atomic single-use redemption, a fifteen-record ceiling, idempotent principal creation, and cross-principal isolation
- [x] 2.3 Make replacement atomic only after validation success and preserve the prior generation on any failure; verify concurrent and failed rotations leave exactly one known-good current record
- [ ] 2.4 Extend privacy checks and representative secret-value tests across invitations, envelopes, storage errors, logs, responses, URLs, fixtures, and Git; verify no invitee email, reusable invitation capability, username, password, nonce+ciphertext envelope, key, or reusable session material is exposed

## 3. Admission and Container Credential Resolution

- [x] 3.1 Extend the existing controller admission result to require and carry the current sealed credential generation without another Durable Object RPC; verify missing/revoked records reject before Container wake and existing rate, tier, reserve, quota, and breaker behavior is unchanged
- [x] 3.2 Strip every client-supplied internal credential/generation header and attach only the controller-returned sealed envelope to the internal Container request; verify spoofed headers cannot select, replace, or reveal a credential
- [x] 3.3 Replace Container policy-embedded credential resolution with authenticated envelope decryption and bind contexts/sessions to principal key, policy revision, and credential generation; verify cross-principal envelopes fail and generation changes invalidate an open session on its next request
- [x] 3.4 Retain schema-v1 credentials only as a bounded Tier 0 migration fallback and make schema-v2 absence fail closed; verify no invitee or version-2 principal can use legacy or owner credentials

## 4. Browser Authentication and Portal

- [ ] 4.1 Revise configuration validation for the disabled-by-default onboarding switch, ordinary Auth0 Free web-client settings, browser-session/credential keys, rate limits, HTTPS origin, and callback with no Organization setting; verify missing, malformed, inconsistent, or unsafe production values fail closed while the ChatGPT OAuth client remains unchanged
- [ ] 4.2 Revise authorization-code-with-PKCE browser login and callback handling against the existing Auth0 issuer with no invitation or Organization parameter forwarding; verify state, nonce, PKCE, issuer, audience/client, verified email, callback, and subject validation failures are rejected without logging or persisting identity data
- [ ] 4.3 Add owner-only exact-email invitation creation/cancellation, match the verified callback email by keyed digest, and atomically consume it into one pending Tier 1 principal; verify missing, expired, cancelled, replayed, and wrong-email invitations share one denial shape, unknown users cannot self-register, no user can choose a tier, and owner controls take effect on the next admission
- [ ] 4.4 Extend the minimal server-side `/connect` portal with owner-only invitation controls and native password-manager fields, no preloaded values or third-party assets, restrictive CSP/frame/referrer/MIME/permissions headers, and `no-store`; verify accessibility, enumeration resistance, and absence of email or secret-bearing markup after submission
- [ ] 4.5 Extend CSRF-bound, origin-checked, bounded POST routes with owner-only invite/cancel alongside replace/revoke and constant-shape sanitized results; verify cross-site, replayed, oversized, malformed, wrong-method, unauthenticated, and non-owner requests stop before storage or Container access

## 5. Bounded Read-Only Validation

- [x] 5.1 Add a private Worker-to-Container credential-validation route that can perform only one login and one cheapest authenticated read under the existing deadline; verify it exposes no MCP/basket interface and cannot mutate basket, favorites, profile, address, order, delivery slot, or payment state
- [x] 5.2 Enforce conservative per-principal and global validation limits before Container wake with no automatic retry; verify repeated failures stop at the gateway, do not replace the prior generation, and cannot create unbounded logs or work
- [x] 5.3 Wire successful validation to atomic replace and revocation to immediate generation absence; verify status never reveals username/password and rotation/revocation produce the required stale-session and reconnect behavior

## 6. MCP Connection Guidance

- [x] 6.1 Add a read-only connection-status path/tool that reports only connected, connection-required, or reconnect-required state and the fixed trusted portal URL; verify annotations and results contain no identity, credential, envelope, session, or operator-only value
- [x] 6.2 Use SDK URL-mode elicitation only when the negotiated client capability supports it and otherwise return fixed-page manual guidance; verify neither path uses form elicitation or embeds a token, subject, credential, state, or preauthenticated capability in the URL
- [ ] 6.3 Verify current ChatGPT capability behavior and accepted-subject matching without an invitation or email claim in synthetic protocol tests, then document real-client acceptance without assuming URL elicitation support or changing the existing `Nemlig Assistant` app identity

## 7. Repository Verification and Delivery

- [ ] 7.1 Update operations, fixed-URL exact-email invitation, credential rotation/revocation, principal disable, migration/rollback, Auth0 Free app setup, incident response, and user guidance without adding credentials or claiming unshipped behavior in the README; verify all examples are placeholder-only, require no Organization/Management API/email provider, and preserve disabled-first operation
- [ ] 7.2 Run focused policy, invitation-digest, crypto, controller, onboarding, gateway, HTTP, Container, privacy, interface, and production-acceptance tests plus TypeScript checks; verify every security and isolation branch has a runnable regression check
- [ ] 7.3 Run strict validation for this change, all strict OpenSpec validation, privacy checks, `pnpm verify`, package smoke, and the credential-free Cloudflare production dry run; verify no command requires a real Nemlig credential or mutates a provider
- [ ] 7.4 Inspect the complete revised diff for opposing specs, unrelated edits, identity or credential leakage, request amplification, weakened quotas/retries/kill switches, new costs, and accidental mutation surfaces; verify the scoped work remains additive and conflict-free
- [ ] 7.5 Commit the verified revised implementation, fetch/rebase current `origin/main`, rerun affected gates, push the feature branch and coordinated `main`, and verify exact remote refs and exact-head CI before any provider action

## 8. Human Provider and Cost Checkpoint

- [x] 8.1 **[HUMAN CHECKPOINT]** Review the current Auth0 tenant for Organizations, native invitation email or generated-link availability, and no-new-cost operation plus the Cloudflare secret/stored-row/request model, worst credible abuse bound, and rollback; verify no payment-method, plan, quota, email provider, or provider change proceeds without explicit owner direction
  - Live review on 2026-09-06 found the tenant on Free ($0) with 17 trial days remaining. Organizations and its create flow are available only under the active trial; the live plan comparison shows the first continuing entitlement as 10 Organizations on Essentials at $1,750/month. Cloudflare remains on the existing two Durable Objects and one EU `lite` Container with `max_instances: 1`, validation capped at 3 attempts per principal and 10 globally per minute, and no new namespace or service. The current enabled rollback version is `4e2af164-6bd4-4bdc-8d2c-2b4e283f7bbe`. No provider state, secret, payment, plan, or deployment was changed; the owner chose a revised no-Organizations design.
- [ ] 8.2 **[HUMAN CHECKPOINT]** Create exactly one confidential regular web application supported by the existing Auth0 Free tenant with reviewed callback/logout/origin/grant settings while leaving the third-party ChatGPT client unchanged; verify non-secret identifiers and login behavior without exposing any secret, token, code, state, email, or user credential
- [ ] 8.3 **[HUMAN CHECKPOINT]** Provision the browser-session and versioned credential-encryption secrets through interactive provider input; verify binding presence and configuration validity without printing, copying into chat, persisting locally, or committing secret values

## 9. Disabled-First Owner Migration

- [ ] 9.1 Record the exact enabled pre-migration version and policy revision, deploy the exact verified commit with both MCP and onboarding disabled, and verify both production routes fail closed with no Container or Nemlig activity
- [ ] 9.2 Enable onboarding only, have the owner authenticate and enter their Nemlig credentials directly in the browser portal, and verify bounded read-only validation and encrypted-record presence without exposing values or mutating shopping data
- [ ] 9.3 Switch the owner to schema-v2 record resolution, enable the same reviewed MCP version, and verify health, Auth0 rejection, owner read-only ChatGPT lists/favorites, quotas, breaker, logs, rotation, stale-session rejection, revocation, and reconnect
- [ ] 9.4 If any migration gate fails, disable both surfaces, restore the recorded version/policy, and verify the previous owner read-only path and cost controls before resuming

## 10. Invite-Driven Self-Enrollment and Isolation

- [ ] 10.1 **[HUMAN CHECKPOINT]** Record one seven-day invitation for the boss's exact email in the owner portal and share only the fixed connection URL through an existing secure channel; verify storage and UI expose neither the email nor a reusable invitation capability and no email provider, Management API client, payment, plan change, or extra secret is introduced
- [ ] 10.2 Have the boss authenticate with the exact invited and Auth0-verified email, then verify one pending Tier 1 principal is bound to the resulting subject without manual subject copying; verify missing, wrong-email, expired, cancelled, and replayed invitations create nothing and reveal the same denial shape
- [ ] 10.3 Have the boss enter only their own Nemlig credentials in the portal, then verify bounded read-only authentication, encrypted-record status, isolation prerequisites, and automatic conditional Tier 1 activation under the owner-issued invitation without the operator or ChatGPT receiving the credential
- [ ] 10.4 Run two-principal isolation acceptance for credentials, sessions, proposals, basket view, favorites, saved plans, named lists, rate accounting, owner disable, and credential/access revocation using read-only checks; verify no state or credential fallback crosses principal boundaries and one fresh boss ChatGPT conversation resolves the same subject without an invitation or email claim while Tier 0 reserved capacity and all global controls remain intact

## 11. Finalize the Change

- [ ] 11.1 Remove the schema-v1 credential fallback only after owner and invitee acceptance, rotate or retire superseded secrets as documented, and verify rollback and emergency-disable procedures still have a known safe target
- [ ] 11.2 Sync the accepted deltas to main specs, archive the completed OpenSpec change, run final strict validation and `pnpm verify`, commit/push, and verify exact-head CI plus production revision readback
