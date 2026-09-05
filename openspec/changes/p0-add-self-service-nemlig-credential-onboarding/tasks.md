## 1. Contract and Baseline

- [ ] 1.1 Rebase the isolated worktree onto current `origin/main`, confirm `fix-nemlig-oauth-reliability` and sibling work remain unchanged, and verify the branch/root/base/status evidence is clean
- [ ] 1.2 Add synthetic schema-v2 policy fixtures with credential-free principals while retaining a single-owner schema-v1 migration fixture; verify strict parsing rejects cross-principal fallback, duplicate identity, unsafe keys, and invalid tier ordering
- [ ] 1.3 Record the bounded cost model and implementation file map before code changes; verify the design adds no dependency, Durable Object namespace, Container, autoscaling, polling, scheduler, queue, or paid service

## 2. Credential Envelope and Principal Records

- [ ] 2.1 Implement the bounded versioned credential-envelope schema and Web Crypto AES-256-GCM helpers with principal key, policy revision, key version, and generation as authenticated data; verify round-trip, tamper, wrong-principal, wrong-generation, malformed-size, and wrong-key tests
- [ ] 2.2 Add principal-scoped credential create/read/replace/delete operations to the existing fixed controller storage with monotonic generations and no plaintext persistence; verify one principal cannot read, overwrite, or revoke another principal's record
- [ ] 2.3 Make replacement atomic only after validation success and preserve the prior generation on any failure; verify concurrent and failed rotations leave exactly one known-good current record
- [ ] 2.4 Extend privacy checks and representative secret-value tests across envelopes, storage errors, logs, responses, URLs, fixtures, and Git; verify no username, password, nonce+ciphertext envelope, key, or reusable session material is exposed

## 3. Admission and Container Credential Resolution

- [ ] 3.1 Extend the existing controller admission result to require and carry the current sealed credential generation without another Durable Object RPC; verify missing/revoked records reject before Container wake and existing rate, tier, reserve, quota, and breaker behavior is unchanged
- [ ] 3.2 Strip every client-supplied internal credential/generation header and attach only the controller-returned sealed envelope to the internal Container request; verify spoofed headers cannot select, replace, or reveal a credential
- [ ] 3.3 Replace Container policy-embedded credential resolution with authenticated envelope decryption and bind contexts/sessions to principal key, policy revision, and credential generation; verify cross-principal envelopes fail and generation changes invalidate an open session on its next request
- [ ] 3.4 Retain schema-v1 credentials only as a bounded Tier 0 migration fallback and make schema-v2 absence fail closed; verify no invitee or version-2 principal can use legacy or owner credentials

## 4. Browser Authentication and Portal

- [ ] 4.1 Add configuration validation for the disabled-by-default onboarding switch, exact Auth0 web-client settings, browser-session key, credential key/version, rate limits, HTTPS origin, and callback; verify missing, malformed, inconsistent, or unsafe production values fail closed
- [ ] 4.2 Implement authorization-code-with-PKCE browser login and callback handling against the existing Auth0 issuer with short-lived signed `Secure`, `HttpOnly`, `SameSite=Lax` sessions; verify state, nonce, PKCE, issuer, audience/client, expiry, callback, and subject validation failures are rejected
- [ ] 4.3 Authorize portal operations by exact policy subject while allowing a configured disabled invitee to provision without gaining MCP access; verify unknown, uninvited, disabled-for-MCP, enabled, and mismatched identities follow the specified boundaries
- [ ] 4.4 Render the minimal server-side `/connect` status/form with native password-manager fields, no preloaded values or third-party assets, restrictive CSP/frame/referrer/MIME/permissions headers, and `no-store`; verify headers, accessibility labels, autocomplete attributes, and absence of secret-bearing markup
- [ ] 4.5 Implement CSRF-bound, origin-checked, bounded POST routes for replace and revoke with constant-shape sanitized results; verify cross-site, replayed, oversized, malformed, wrong-method, and unauthenticated requests stop before storage or Container access

## 5. Bounded Read-Only Validation

- [ ] 5.1 Add a private Worker-to-Container credential-validation route that can perform only one login and one cheapest authenticated read under the existing deadline; verify it exposes no MCP/basket interface and cannot mutate basket, favorites, profile, address, order, delivery slot, or payment state
- [ ] 5.2 Enforce conservative per-principal and global validation limits before Container wake with no automatic retry; verify repeated failures stop at the gateway, do not replace the prior generation, and cannot create unbounded logs or work
- [ ] 5.3 Wire successful validation to atomic replace and revocation to immediate generation absence; verify status never reveals username/password and rotation/revocation produce the required stale-session and reconnect behavior

## 6. MCP Connection Guidance

- [ ] 6.1 Add a read-only connection-status path/tool that reports only connected, connection-required, or reconnect-required state and the fixed trusted portal URL; verify annotations and results contain no identity, credential, envelope, session, or operator-only value
- [ ] 6.2 Use SDK URL-mode elicitation only when the negotiated client capability supports it and otherwise return fixed-page manual guidance; verify neither path uses form elicitation or embeds a token, subject, credential, state, or preauthenticated capability in the URL
- [ ] 6.3 Verify current ChatGPT capability behavior in a synthetic protocol test and document real-client acceptance without assuming URL elicitation support or changing the existing `Nemlig Assistant` app identity

## 7. Repository Verification and Delivery

- [ ] 7.1 Update operations, credential rotation/revocation, migration/rollback, Auth0 setup, incident response, and user guidance without adding credentials or claiming unshipped behavior in the README; verify all examples are placeholder-only and require disabled-first operation
- [ ] 7.2 Run focused policy, crypto, controller, gateway, HTTP, Container, privacy, interface, and production-acceptance tests plus TypeScript checks; verify every security and isolation branch has a runnable regression check
- [ ] 7.3 Run strict validation for this change, all strict OpenSpec validation, privacy checks, `pnpm verify`, package smoke, and the credential-free Cloudflare production dry run; verify no command requires a real Nemlig credential or mutates a provider
- [ ] 7.4 Inspect the complete diff for opposing specs, unrelated edits, credential leakage, request amplification, weakened quotas/retries/kill switches, new costs, and accidental mutation surfaces; verify the scoped work remains additive and conflict-free
- [ ] 7.5 Commit the verified implementation, fetch/rebase current `origin/main`, rerun affected gates, push the feature branch and coordinated `main`, and verify exact remote refs and exact-head CI before any provider action

## 8. Human Provider and Cost Checkpoint

- [ ] 8.1 **[HUMAN CHECKPOINT]** Review the current and proposed Auth0/Cloudflare plan state, added secret and stored-row/request model, worst credible abuse bound, and lower-cost rollback; verify no payment-method, plan, quota, or provider change proceeds without explicit owner direction
- [ ] 8.2 **[HUMAN CHECKPOINT]** Create exactly one confidential Auth0 web application in the existing EU tenant with the reviewed callback/logout/origin/grant settings; verify its non-secret identifiers and login behavior without exposing the client secret, token, code, state, or user credential
- [ ] 8.3 **[HUMAN CHECKPOINT]** Provision the browser-session and versioned credential-encryption secrets through interactive provider input; verify binding presence and configuration validity without printing, copying into chat, persisting locally, or committing secret values

## 9. Disabled-First Owner Migration

- [ ] 9.1 Record the exact enabled pre-migration version and policy revision, deploy the exact verified commit with both MCP and onboarding disabled, and verify both production routes fail closed with no Container or Nemlig activity
- [ ] 9.2 Enable onboarding only, have the owner authenticate and enter their Nemlig credentials directly in the browser portal, and verify bounded read-only validation and encrypted-record presence without exposing values or mutating shopping data
- [ ] 9.3 Switch the owner to schema-v2 record resolution, enable the same reviewed MCP version, and verify health, Auth0 rejection, owner read-only ChatGPT lists/favorites, quotas, breaker, logs, rotation, stale-session rejection, revocation, and reconnect
- [ ] 9.4 If any migration gate fails, disable both surfaces, restore the recorded version/policy, and verify the previous owner read-only path and cost controls before resuming

## 10. Invited-User Isolation and Activation

- [ ] 10.1 Add the boss's verified Auth0 subject as a disabled Tier 1 principal through the owner-controlled policy procedure; verify unknown users remain denied and the boss cannot perform useful MCP work before activation
- [ ] 10.2 Have the boss authenticate and enter only their own Nemlig credentials in the portal, then verify encrypted-record status and one read-only authentication check without the operator or ChatGPT receiving the credential
- [ ] 10.3 Run two-principal isolation acceptance for credentials, sessions, proposals, basket view, favorites, saved plans, named lists, rate accounting, and revocation using read-only checks; verify no state or credential fallback crosses principal boundaries
- [ ] 10.4 **[HUMAN CHECKPOINT]** Review isolation and cost evidence and explicitly enable Tier 1; verify one fresh boss ChatGPT conversation reads only that boss's shopping lists while Tier 0 reserved capacity and all global controls remain intact

## 11. Finalize the Change

- [ ] 11.1 Remove the schema-v1 credential fallback only after owner and invitee acceptance, rotate or retire superseded secrets as documented, and verify rollback and emergency-disable procedures still have a known safe target
- [ ] 11.2 Sync the accepted deltas to main specs, archive the completed OpenSpec change, run final strict validation and `pnpm verify`, commit/push, and verify exact-head CI plus production revision readback
