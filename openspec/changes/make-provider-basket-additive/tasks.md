## 1. Make approved additions additive

- [x] 1.1 Change proposal preparation to present requested quantities as deltas and compute projected final quantities/totals; verify with a basket fixture containing an existing matching line.
- [x] 1.2 Apply each approved delta from the latest verified basket state and verify exact target line, unchanged unrelated lines, totals, and stale-snapshot rejection with focused regression tests.
- [x] 1.3 Preserve single-use and uncertain-write safeguards; verify a failed/uncertain write is attempted once and no automatic retry occurs.

## 2. Remove provider-destructive capabilities

- [x] 2.1 Delete provider remove, replacement, and clear operations from client, proposal service, MCP registry, CLI, and API inventory; verify tool/command enumeration has no such path and local-only review edits still work.
- [x] 2.2 Remove obsolete destructive-operation tests and replace them with absence/allowlist assertions; run focused client, proposal, and MCP tests.

## 3. Reuse authenticated sessions

- [x] 3.1 Stop forcing a new `/login` immediately before a protected write when the current authorized client session is already valid; verify warm writes issue no login and cold writes authenticate before any mutation.
- [x] 3.2 Keep current login flags unchanged; record the rejected HTTP 400 responses and stop additional login attempts without a new concrete diagnosis.
- [x] 3.3 Match the first-party anti-forgery flow for cold login and state-changing API calls: fetch `/webapi/AntiForgery` when no XSRF cookie exists, retain XSRF-prefixed cookies in the existing jar, send `X-XSRF-TOKEN` plus same-origin `Origin`, and exclude the old session cookie from login. Client, credential-validation, and basket-write regressions pass without exposing tokens.

## 4. Document and verify the safety boundary

- [x] 4.1 Update the README, API inventory, current OpenSpecs, and issue #165 with add-only behavior, removed operations, the absolute-quantity provider endpoint, and the external concurrent-edit limitation; verify repository privacy checks pass.
- [x] 4.2 Run focused Nemlig tests, strict OpenSpec validation, and the repository verification gates; inspect the exact diff for remaining decrement/clear paths.
- [x] 4.3 After the anti-forgery fix passes local tests, perform bounded real login/flag probes with immediate read-only basket readback. Three POST attempts for `CheckForExistingProducts=true, DoMerge=true, SaveExistingBasket=false` returned HTTP 400. The final attempt included both XSRF cookies, `X-XSRF-TOKEN`, and `Origin`; the sanitized probe captured no validation-field names. Browser readback after each showed 2 bananas and 1 milk unchanged. Keep flags unchanged; semantics remain unproven. No checkout or order.
- [x] 4.4 Open one scoped draft PR with exact tested SHA and release note; keep deployment and goal completion blocked until the login/cold-start preservation and provider concurrency evidence are sufficient.
