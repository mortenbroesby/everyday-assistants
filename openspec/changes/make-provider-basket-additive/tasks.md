## 1. Make approved additions additive

- [x] 1.1 Change proposal preparation to present requested quantities as deltas and compute projected final quantities/totals; verify with a basket fixture containing an existing matching line.
- [x] 1.2 Apply each approved delta from the latest verified basket state and verify exact target line, unchanged unrelated lines, totals, and stale-snapshot rejection with focused regression tests.
- [x] 1.3 Preserve single-use and uncertain-write safeguards; verify a failed/uncertain write is attempted once and no automatic retry occurs.
- [x] 1.4 Bind each product write to the last verified basket snapshot; reject detected drift before POST and consume partial batches without retry or rollback.
- [x] 1.5 Add real-client mock-HTTP regressions for sequential multi-line writes, existing and unrelated lines, drift before the first/later POST, and uncertain partial failure.

## 2. Remove provider-destructive capabilities

- [x] 2.1 Delete provider remove, replacement, and clear operations from client, proposal service, MCP registry, CLI, and API inventory; verify tool/command enumeration has no such path and local-only review edits still work.
- [x] 2.2 Remove obsolete destructive-operation tests and replace them with absence/allowlist assertions; run focused client, proposal, and MCP tests.

## 3. Reuse authenticated sessions

- [x] 3.1 Stop forcing a new `/login` immediately before a protected write when the current authorized client session is already valid; verify warm writes issue no login and cold writes authenticate before any mutation.
- [x] 3.2 Replace the unconditional `false,false,false` tuple in login and credential validation with Nemlig's ordinary website flags, never silently choose the website's “remove from basket” tuple, and fail closed on unresolved merge responses; verify exact flags and no fallback login in client tests.
- [x] 3.3 Match the first-party anti-forgery flow for cold login and state-changing API calls: fetch `/webapi/AntiForgery` when no XSRF cookie exists, retain XSRF-prefixed cookies in the existing jar, send `X-XSRF-TOKEN` plus same-origin `Origin`, and exclude the old session cookie from login. Client, credential-validation, and basket-write regressions pass without exposing tokens.

## 4. Document and verify the safety boundary

- [x] 4.1 Update the README, API inventory, current OpenSpecs, and issue #165 with add-only behavior, removed operations, login-flag source mapping, sequential per-product writes, stale-snapshot handling, the absolute-quantity endpoint, and the external concurrent-edit limitation; verify privacy checks pass.
- [x] 4.2 Re-run the full relevant Nemlig/repository verification gates on the final implementation and inspect the exact diff for remaining decrement/clear paths.
- [ ] 4.3 Once the current authorized credential session is active, send at most one cold login using ordinary website flags, then immediately read back the basket in the already-authenticated browser; do not retry after any error. Record pass/fail/blocked and the exact request flags without credentials or basket contents. No checkout or order.
- [ ] 4.4 Update the existing scoped PR and issue #165 with the implementation evidence and remaining live limitation; keep PR draft, deployment, and goal completion pending until cold-login preservation and provider concurrency evidence are sufficient.
