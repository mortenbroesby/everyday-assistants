## Context

See `proposal.md` and the two delta specs. The provider's observed `AddToBasket` request is an absolute per-product quantity write, not an increment. The same endpoint was observed from the website's plus control. No compare-and-set or atomic increment contract is documented in the repository's observed API inventory. The first-party `GET /webapi/AntiForgery` returns the `X-XSRF-TOKEN` name/value and sets `XSRF-TOKEN` plus `XSRF-COOKIE-TOKEN`; browser same-origin POST requests also carry `Origin`. The Node client now mirrors those request attributes without sending an old authenticated session cookie during re-login. A final bounded request using `CheckForExistingProducts=true`, `DoMerge=true`, `SaveExistingBasket=false` and the observed anti-forgery cookies/header plus `Origin` returned HTTP 400; two earlier partial-header attempts with the same flags also returned HTTP 400. Browser readback after each failure showed the baseline basket unchanged. The sanitized probe captured no validation-field names. No further login request will be sent without a new concrete diagnosis. The login flags' semantics remain unverified.

## Goals / Non-Goals

**Goals:** Make the assistant's supported provider operations additions-only; interpret requested quantities as positive deltas; remove alternate code paths that reduce/remove/clear basket contents; avoid unnecessary login POSTs on a valid in-memory session; mirror the first-party anti-forgery bootstrap and request header on cold login and subsequent writes.

**Non-Goals:** Guess new login flags, retry failed login attempts, create a second provider write mechanism, expose a direct unapproved write, checkout/order/payment/delivery, or claim atomicity that Nemlig has not provided.

## Decisions

- Store the approved line quantity as an addition delta. Preparation computes and displays the expected final line quantity and basket totals from the current basket snapshot. Apply continues to require the unchanged basket fingerprint and fresh product facts.
- Keep the HTTP adapter's set-quantity operation private to the provider client. The provider client re-reads the basket, computes current quantity plus the requested delta, sends that absolute target, then verifies readback and retained lines. Never intentionally send a target below that latest read. If any provider write/readback is uncertain, consume the proposal and stop; do not compensate or retry.
- Remove removal, replacement, and clear operations end-to-end: MCP tool registrations, proposal operation variants, CLI removal, client methods, API inventory entries, and tests. Retain local-only review edits.
- Remove `fresh=true` from protected-write authentication calls. The request-scoped MCP server reuses the authenticated per-principal client context; a cold session authenticates before the first provider task, and current basket reads and product revalidation remain before any write. Do not retry an uncertain write or change unverified login flags.
- Before cold login, issue the first-party `GET /webapi/AntiForgery`, retain its XSRF cookies, and send the `X-XSRF-TOKEN` header plus same-origin `Origin` on state-changing API requests. Use the existing cookie jar; unauthenticated login sends only XSRF-prefixed cookies, never the previous session cookie. Do not add a second session store or expose token values. Prime anti-forgery state in credential validation as well as normal login.
- Do not alter the current login flags until a successful real login and immediate basket readback are observed. A public community client using different flags is a lead, not evidence that its older endpoint or flag meanings apply to this live account.

## Risks / Trade-offs

- [The provider write is absolute and has no observed atomic precondition] → Re-read immediately before each write, abort on stale snapshots, never decrease a quantity relative to the latest verified read, verify readback, and explicitly document the remaining race with an independent Nemlig website/app edit between read and write. This is mitigation, not proof of concurrency-safe atomic addition.
- [Cold-start login still returns HTTP 400 after the observed anti-forgery headers/cookies were added] → The final request matched the observed first-party XSRF and Origin boundary, but no successful cold login has been demonstrated. Keep flags unchanged, do not infer their semantics, and pause further login attempts to avoid account lockout. Basket readback after each rejected request showed the known baseline unchanged.
- [Removing tools breaks clients that previously used remove/swap/clear] → Treat these as intentional breaking changes; the owner can use Nemlig.com directly for those operations.
- [A network failure may occur after Nemlig applied an addition] → Preserve the existing single-use indeterminate result and manual readback workflow; never auto-retry.

## Migration Plan

1. Implement and test the contract in the isolated feature worktree; update the existing durable specs and README.
2. Run focused tests, package/repository verification, browser smoke where applicable, and static assertions that no assistant remove/clear endpoint remains.
3. Open one scoped PR linked to issue #165. Release only after review and exact-head CI. Do not deploy while the login-flag blocker or unresolved severity assessment indicates a remaining path to data loss.
4. Post-release, use the existing authorized account for readback-only acceptance first. Any provider add test must be explicitly reviewed, retain all existing lines, and never proceed to checkout or delivery booking.

## Open Questions

- What provider condition causes HTTP 400 after the first-party anti-forgery cookies/header and `Origin` are present? Obtain a safe provider error classification without repeating sign-ins; only then decide whether any new login attempt is warranted. No successful login/readback has established flag semantics.
- Is there a supported conditional or additive endpoint that removes the external-client race? The observed website plus call is absolute quantity; no atomic increment has been established.
