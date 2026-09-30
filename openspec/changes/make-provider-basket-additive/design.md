## Context

See `proposal.md` and the two delta specs. The provider's observed `AddToBasket` request is an absolute per-product quantity write, not an increment. Current Nemlig website JavaScript calls that same endpoint from its quantity control with the requested total quantity; no atomic increment or compare-and-set route was found in the current basket API paths. The first-party `GET /webapi/AntiForgery` returns the `X-XSRF-TOKEN` name/value and sets `XSRF-TOKEN` plus `XSRF-COOKIE-TOKEN`; browser same-origin POST requests also carry `Origin`. The Node client now mirrors those request attributes without sending an old authenticated session cookie during re-login.

Current first-party login code uses `CheckForExistingProducts=true`, `DoMerge=true`, `SaveExistingBasket=false` for ordinary login. Its merge dialog sends `false,true,false` for the user's explicit merge choice and `false,false,false` for the “remove from basket” choice. A separate order-edit flow explicitly calls `ClearBasket` for its remove choice. This establishes the website's client-side mapping, not the backend effect of a direct request from this assistant. Three prior bounded requests using the ordinary-login flags and progressively complete anti-forgery/Origin headers returned HTTP 400; the sanitized response did not establish a useful failure classification, and browser readback after each showed the known basket unchanged. No further login attempt should be made without the required active credential session and a single-attempt, immediate-readback plan.

## Goals / Non-Goals

**Goals:** Make the assistant's supported provider operations additions-only; interpret requested quantities as positive deltas; remove alternate code paths that reduce/remove/clear basket contents; avoid unnecessary login POSTs on a valid in-memory session; mirror the first-party anti-forgery bootstrap and request header on cold login and subsequent writes.

**Non-Goals:** Try speculative login-flag combinations, retry failed login attempts, create a second provider write mechanism, expose a direct unapproved write, checkout/order/payment/delivery, or claim atomicity that Nemlig has not provided.

## Decisions

- Store the approved line quantity as an addition delta. Preparation computes and displays the expected final line quantity and basket totals from the current basket snapshot. Apply requires the unchanged basket fingerprint and fresh product facts.
- Keep the HTTP adapter's set-quantity operation private to the provider client. For each distinct product, the provider client reads the basket, compares it with the last verified snapshot, sends the verified current quantity plus the approved delta as one absolute target, and verifies readback before the next product. A changed snapshot stops before that POST. If earlier product additions were verified, consume the proposal and report that the partial batch needs inspection; never compensate or retry.
- Because Nemlig's endpoint sets an absolute quantity, a change by another client after this pre-write read but before the POST can still race. Readback and snapshot checks mitigate stale writes but cannot provide atomic increment semantics.
- Remove removal, replacement, and clear operations end-to-end: MCP tool registrations, proposal operation variants, CLI removal, client methods, API inventory entries, and tests. Retain local-only review edits.
- Remove `fresh=true` from protected-write authentication calls. The request-scoped MCP server reuses the authenticated per-principal client context; a cold session authenticates before the first provider task, and current basket reads and product revalidation remain before any write. Cold login uses the website's ordinary flags (`true,true,false`), never the tuple the website associates with “remove from basket” (`false,false,false`). If Nemlig returns an unresolved-merge result or request failure, fail closed; do not auto-select merge, save, or remove, and do not retry.
- Before cold login, issue the first-party `GET /webapi/AntiForgery`, retain its XSRF cookies, and send the `X-XSRF-TOKEN` header plus same-origin `Origin` on state-changing API requests. Use the existing cookie jar; unauthenticated login sends only XSRF-prefixed cookies, never the previous session cookie. Do not add a second session store or expose token values. Prime anti-forgery state in credential validation as well as normal login.
- Use the flags from the current first-party website's ordinary login request. Do not infer that they guarantee no provider-side merge; a failed or unresolved login must stop without trying either explicit dialog choice. The ordinary request tuple is selected because the current website itself uses it before requesting user input, not because a live test proved it safe for this account.

## Risks / Trade-offs

- [The provider write is absolute and has no observed atomic precondition] → Compare the immediate pre-write basket with the last verified snapshot, abort on detected drift, verify readback after each line, and document the remaining race with an independent Nemlig website/app edit between read and write. This is mitigation, not proof of concurrency-safe atomic addition.
- [Direct backend effects of login flags remain unverified] → Avoid the first-party delete-choice tuple; use ordinary website login flags, treat explicit merge-required/failure responses as a stop condition, and require one live successful login with immediate basket readback before claiming the mapping preserves this account.
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
