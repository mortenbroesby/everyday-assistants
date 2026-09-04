# Nemlig Assistant backlog

## P0 — restore reliable ChatGPT reconnect and add bounded observability

**Status:** Active incident. Track and complete
[GitHub issue #6](https://github.com/mortenbroesby/everyday-assistants/issues/6)
before further demo-dependent feature work.

- Reproduce and identify the exact failing boundary in the expired ChatGPT OAuth
  reconnect flow. The Worker, Auth0 discovery, OAuth resource metadata, and
  authenticated read-only tools are currently responsive, so the remaining
  root cause must not be attributed to the backend without evidence.
- Restore and prove a fresh connection through the one existing Nemlig Assistant
  app, including two successful read-only ChatGPT acceptance runs.
- Add redacted structured Worker logs with correlation IDs and clear boundary
  outcomes for the kill switch, authorization, Durable Object dispatch, upstream
  calls, circuit-breaker changes, and deployment identity.
- Keep the generous final 90-second request ceiling, 85-second Container
  ceiling, and 60-second Nemlig interaction window so slow catalogue work can
  finish while a genuinely stalled request still terminates clearly.
- Keep retries bounded and mutation-safe. Preserve the kill switch, circuit
  breaker, quotas, approval envelopes, and fail-closed behavior.
- Bound observability cost with sampling, short retention, field-size limits,
  and no payload duplication. Review the cost model and sensitive-field
  redaction before production enablement.
- Deploy disabled first, verify fail-closed behavior, enable the same version,
  and rerun anonymous-edge plus authenticated read-only production acceptance.
- Remove the inactive legacy Mac tunnel services only after the cloud-only path
  is verified.

This item does not authorize any Nemlig basket mutation.

## P1 — predictable automated production deployment

**Status:** Not started.

- Provide one repository-owned command or manually dispatched workflow that,
  after explicit production approval, accepts an exact pushed `main` commit and
  refuses a non-CI-green or mismatched revision.
- Build once, deploy that exact artifact disabled, verify both routes fail
  closed and the fixed Container is inactive, then enable or promote the same
  artifact without rebuilding it.
- Run revision, health, OAuth metadata, cheap rejection, and authenticated
  read-only acceptance automatically with explicit deadlines.
- Serialize deployments so two releases cannot overlap. On failure, leave the
  service disabled or restore the recorded last-known-good version and report
  the exact resulting state.
- Publish a redacted deployment summary containing commit, version IDs,
  timings, checks, and rollback state. Never treat green CI as deployment
  authority or retry a Nemlig mutation.
- Before implementation, document incremental CI minutes, probes, logs, and
  provider calls; retain one `lite` Container and the existing cost ceilings.

## P1 — prove the kill switch and cost-containment safety net

**Status:** Not started.

- Add an owner-authorized repeatable drill that disables production, proves
  both routes reject before authentication, Durable Object dispatch, or
  Container wake, restores the exact prior state, and verifies health.
- Make interruption recoverable and report the last verified state instead of
  guessing whether production is enabled.
- Compare live configuration with the repository contract: one `lite`
  Container, sleep policy, useful and expensive quotas, per-minute limits,
  circuit-breaker threshold, CPU/subrequest limits, retry bounds, deadlines,
  and bounded log sampling/retention.
- Add regression tests that fail if authentication no longer precedes wake, the
  kill switch permits backend dispatch, retries amplify, capacity increases,
  quotas disappear, or terminal safety evidence is absent.
- Produce a conservative daily and monthly cost envelope from configured
  maximums and current provider pricing, clearly separating hard technical
  ceilings from delayed alerts and recurring charges.
- Add a low-traffic scheduled read-only drift audit and define which breaches
  only alert, open the breaker, or require owner-approved kill-switch action.

Done means a recorded drill proves disable, no wake, exact restoration, and
post-restore health, and the owner accepts the documented worst credible cost.

## P1 — make product wording reliably reach Danish catalogue search

**Source:** [GitHub issue #7](https://github.com/mortenbroesby/everyday-assistants/issues/7)

**Status:** Catalogue-first routing and loose Danish guidance are implemented;
the reported Prince-cookie case remains unproven.

- Reproduce the reported miss while confirming the Nemlig app can find the
  product at the same time.
- Cover English, mixed-language, misspelled, and over-specific requests with
  prompt and contract tests, including the reported case.
- Convert ordinary wording to a short Danish catalogue query, preserve
  ambiguous candidates for user choice, and never fall back to favourites.
- Distinguish unavailable discovery from a successful empty result and verify
  the fix through the existing ChatGPT app without changing the basket.

## P1 — verify delivered department browsing and close the loop

**Source:** [GitHub issue #4](https://github.com/mortenbroesby/everyday-assistants/issues/4)

**Status:** Implemented; production evidence and issue disposition remain.

- Verify bounded top-level department listing and pagination through the
  deployed MCP surface.
- Confirm candidate fields and ranking match direct catalogue search and that
  no favourite or basket mutation occurs.
- Record implementation, test, deployment, and read-only acceptance evidence in
  the repository backlog history.

## P1 — decide and execute the public repository rename

**Source:** [GitHub issue #5](https://github.com/mortenbroesby/everyday-assistants/issues/5)

**Status:** Blocked on the owner's final choice between `personal-assistant` and
`everyday-assistant`.

- Inventory affected checkout, remote, documentation, badge, metadata,
  deployment, and automation references before changing anything.
- Perform one reversible rename and verify the local checkout, GitHub redirect,
  `main`, references, and exact-head CI.
- Do not rename or expose the private `personal-assistant-private` repository.

## Named and reusable shopping lists

**Status:** Implemented for the private owner alpha.

- Named reusable and occasion lists are private, bounded, revision-checked,
  copyable, and recoverable through archive/restore.
- Opening a list is storage-only. Current Nemlig resolution is an explicit,
  catalogue-backed action for at most twenty selected lines.
- Reusable means easy to invoke again; it does not mean scheduled or automatic.
- The picker uses direct allowlisted Nemlig images with a complete text fallback
  and no image proxy or cache.

Invited-family collaboration remains future work until a second real user is
ready and owner isolation can be designed from that concrete need.

## Catalogue-first product selection

**Status:** Core routing implemented. Ordinary find-or-add intent uses the
catalogue-backed planner with short, loose Danish wording. Direct catalogue
search retains `find_groceries`, and favourite browsing remains explicit via
`show_my_favorites`.

- The planner searches current catalogue inventory for every ordinary line and
  never loads favourites implicitly.
- Apply the same ranking within either candidate pool: aim for the lowest
  comparable effective price, prefer discounted products, and compare price per
  kilogram or other matching unit when available. A discounted product should
  not win when it is still substantially more expensive than a comparable
  alternative.
- When candidates remain ambiguous, ask the user to choose rather than silently
  approving one.
- Product selection remains discovery. Adding to the basket still requires the
  existing exact proposal and explicit approval flow.

The meaning of "substantial" and handling for incomparable package units need
real examples before implementation; avoid inventing a complex scoring model
until then.

## Future family access

The hosted alpha remains one owner and one Nemlig account. A later release may
allow explicitly invited family members to sign in with their own identity and
link their own Nemlig account. Do not share the owner's credentials, basket,
sessions, proposals, or approvals, and do not build multi-user infrastructure
until a second real user is ready to onboard.
