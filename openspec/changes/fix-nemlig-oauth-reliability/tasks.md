## 1. Preserve the interrupted rollout repair

- [ ] 1.1 Review the five existing named-list storage edits against the failed Cloudflare 530 evidence and verify the focused storage, Worker configuration, and named-list tests pass without changing their scope.
- [ ] 1.2 Commit and push only the verified named-list storage repair as a separate commit, then verify the remote `main` SHA so the P0 reliability diff starts from a stable baseline.

## 2. Add closed, privacy-safe request evidence

- [ ] 2.1 Add a typed allowlisted Worker request-event schema with a server-generated correlation reference, revision, route, method, operation, terminal outcome, status, and elapsed time; verify unit tests reject sensitive keys, raw errors, headers, bodies, query strings, and representative secret values.
- [ ] 2.2 Refactor the gateway to emit at most one terminal event per request plus sparse Container and breaker lifecycle events, return `x-nemlig-request-id`, and deterministically sample ordinary public protocol and authentication rejection events at one percent; verify success, rejection, timeout, breaker, and sampling tests.
- [ ] 2.3 Document the bounded logging cost model—at most one mandatory event per admitted useful operation under the existing 5,000-per-day breaker, sampled public noise, and no new log drain—and verify configuration retains the one-Container, quota, and kill-switch limits.

## 3. Enforce healthy layered deadlines

- [ ] 3.1 Add fail-closed total-request and control-plane timeout configuration with production values of 30,000 ms and 3,000 ms, retain the 5,000 ms Auth0 budget, cap backend work at 25,000 ms or remaining time, and verify invalid or inconsistent budgets are rejected.
- [ ] 3.2 Add a request deadline context and cancellation composition across body reading, authentication, admission, usage/reset RPC, Container dispatch, and internal storage; verify each stalled boundary returns a stable sanitized timeout category and correlation reference within the total budget.
- [ ] 3.3 Reduce Nemlig read-only network work to an 8,000 ms per-attempt timeout with at most one retry, preserve single-attempt mutations and indeterminate-result handling, and verify deterministic retry, cancellation, and no-mutation-retry tests.
- [ ] 3.4 Verify all timeout and error paths emit allowlisted terminal evidence without tokens, credentials, cookies, OAuth artifacts, MCP arguments, shopping data, provider responses, or stacks.

## 4. Make the cloud-only path diagnosable

- [ ] 4.1 Extend the production edge probe with per-step deadlines, `/revision`, latency reporting, and last-completed-boundary output; verify test fixtures cover fast success, timeout, wrong revision metadata, and cheap rejection without external writes.
- [ ] 4.2 Extend authenticated read-only acceptance with a total deadline and explicit shopping-list plus one-result favorites checks; verify its inventory prohibits every list write, feature request, proposal apply, and basket mutation.
- [ ] 4.3 Add a reconnect runbook that separates ChatGPT metadata refresh from OAuth reconnect and records only timestamps, non-secret Auth0 event categories, app identity/URL, Worker correlation evidence, and two fresh read-only ChatGPT results; verify it never instructs creation of a duplicate app or capture of credentials, tokens, codes, OAuth state, or private data.

## 5. Verify and deliver the repository change

- [ ] 5.1 Run focused timeout, logging, gateway, client, acceptance, and privacy tests, then run `pnpm verify`, the production-readiness gate, privacy checking, and strict OpenSpec validation; verify every command passes with no provider or basket mutation.
- [ ] 5.2 Inspect the scoped diff for unrelated edits, secret exposure, log amplification, retry amplification, weakened quotas or approval gates, autoscaling, paid services, and unsupported tunnel fallback; verify all P0 #6 acceptance criteria that can be proven locally are covered.
- [ ] 5.3 Commit and push the completed reliability scope to `main`, verify the remote ref and exact-head CI, and update P0 #6 with the evidence without claiming production or ChatGPT acceptance before it occurs.

## 6. Perform separately authorized production acceptance

- [ ] 6.1 With explicit production approval, deploy the exact verified version disabled, prove both public routes fail closed and the Container remains inactive, then enable that same version and rerun edge plus authenticated read-only acceptance without any mutation.
- [ ] 6.2 Inspect privacy-safe Worker and Auth0 boundary evidence during one bounded reconnect attempt, determine the last completed boundary, and document the incident root cause or external blocker in P0 #6.
- [ ] 6.3 Refresh the one existing ChatGPT app, have the owner complete Auth0 login, and verify two fresh normal ChatGPT conversations each read shopping lists and at most one favorite without creating, editing, preparing, approving, applying, or submitting anything.
- [ ] 6.4 Remove the inactive legacy Mac tunnel services only after cloud-only acceptance passes, verify the Worker and Auth0 path remains healthy, and record the recoverable cleanup outcome.
