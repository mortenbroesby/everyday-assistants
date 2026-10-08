# Nemlig Assistant backlog

Current portfolio disposition is tracked by [#114](https://github.com/mortenbroesby/everyday-assistants/issues/114)
and the [29 September reconciliation](../../docs/openspec-portfolio-reconciliation.md).
Older checked stories below are dated implementation evidence, not a claim
that their retired tools or policies remain supported. Current behavior is in
the README and canonical specs; #67, #96 and #137 own outstanding live gates.

## P3 — simplify the product model

**Status:** Broader roadmap proposed. The owner selected feature-request removal
as the first deletion; source implementation and production acceptance are tracked
in [remove-nemlig-feature-requests](../../openspec/changes/remove-nemlig-feature-requests/proposal.md).
No replacement feedback workflow is planned.

[Product simplification roadmap](../../docs/product-simplification-roadmap.md)
expands the product review against current main. It builds on delivered P2 work
and preserves outstanding P0/P1 and live acceptance ownership.

- Establish measured grocery journeys and the actual advertised tool surface.
- Simplify shared grocery-run orchestration using existing application seams.
- Remove assistant-managed saved plans and named lists; defer native Nemlig list integration.
- Prove MCP v2 host confirmation before changing review/apply interaction.
- Retire only accepted duplicates; retain authorization and mutation safeguards.
- Evaluate Worker-native hosting separately with compatibility and cost gates.

The next slice is baseline evidence and a reviewed application-orchestration
proposal. Six journeys do not require six tools. This roadmap authorizes no
runtime change, provider migration, user-data migration or basket mutation.

## P2 — simplify maintained boundaries and make verification measurable

**Status:** In progress — repository-only slices applied; final integration and
applicable live acceptance remain pending. Builds on the completed maintenance refactor;
does not replace unfinished P0/P1 acceptance or onboarding work.

Plan: [p2-simplify-nemlig-maintenance](../../openspec/changes/p2-simplify-nemlig-maintenance/proposal.md).
See its [ordered epic/story checklist](../../openspec/changes/p2-simplify-nemlig-maintenance/tasks.md)
and [design, npm evaluation and future improvements](../../openspec/changes/p2-simplify-nemlig-maintenance/design.md).
Current checked outcomes and no-op decisions are recorded in the
[implementation evidence](../../openspec/changes/p2-simplify-nemlig-maintenance/evidence.md).

- Make coverage produce a real report with the existing test runner.
- Reuse installed Commander for the hand-written release argument parser.
- Evaluate `html-to-text` to replace regex HTML stripping for product evidence.
- Keep explicit public planning output schemas; saved-list schemas are retired by `remove-saved-shopping`.
- Decouple CLI/server composition and isolate testable planning responsibilities.
- Keep presentation work out of the MCP server unless a concrete client need justifies it.
- Make acceptance entry points import-safe and enforce existing release-version policy in CI.
- Enable native unused-code checks and document safety/public contracts.
- Reconcile backlog/documentation status with implementation and acceptance evidence.

Expanded plan: one P2 epic, ten stories and 50 implementation tasks. The design
also flags invitation-spec mismatch, principal retention/capacity and lifecycle
reliability under their existing P0/P1 owners; these are not cleanup authority.

Implementation must preserve bounded provider work, fresh revalidation,
authorization, private ownership, manual kill switches and deployment safeguards.
Saved-shopping removal is integrated; it does not authorize deleting retained
provider data. App-local operation quotas were removed by PR #152.

## P0 — restore reliable ChatGPT reconnect and add bounded observability

**Status:** Resolved for the authenticated `get_profile` recovery path on
2026-09-22. See the [connector recovery record](../../docs/chatgpt-connector-recovery.md)
and [issue #81](https://github.com/mortenbroesby/everyday-assistants/issues/81)
for the root cause, external correction, and sanitized production evidence.
Provider-backed functionality and longer-term reliability remain separate
work; do not infer them from this acceptance.
Release 6.0.0 retires `get_profile`; authenticated MCP discovery replaces that
historical connector check for new releases.

**Epic outcome:** Restore a repeatably reconnectable, cloud-only ChatGPT app and
close the incident with privacy-safe evidence that identifies the last completed
OAuth boundary without weakening cost or basket safeguards.

### Story P0.1 — make every hosted boundary diagnosable

- [x] Add redacted structured Worker events and correlation IDs for the kill
  switch, authorization, Durable Object dispatch, upstream calls,
  circuit-breaker changes, timeouts, and deployment identity.
- [x] Bound useful-operation evidence by the existing 5,000-per-day breaker,
  retain the closed privacy-safe event for each request during the bounded
  authentication investigation, add no paid log drain, and reject sensitive or
  unbounded fields in tests.
- [x] Publish a reconnect runbook that separates ChatGPT, Auth0, and Worker
  evidence without collecting credentials, tokens, codes, OAuth state, raw
  payloads, or private shopping data.
- [x] Run one bounded reconnect attempt and record only the privacy-safe Auth0
  category plus matching Worker terminal evidence or a confirmed absence.
- [x] Identify and document the exact last completed boundary and the
  evidenced external connector-registration root cause.

### Story P0.2 — terminate stalls without amplifying work

- [x] Keep the final 90-second request ceiling, 85-second Container ceiling,
  60-second Nemlig interaction window, and shorter control-plane budgets.
- [x] Keep read retries bounded to an early transport failure and preserve
  single-attempt, indeterminate-result handling for every mutation.
- [x] Preserve the one-Container ceiling, kill switch,
  approval envelopes, authentication-before-wake, and fail-closed behavior.
- [x] Verify the focused reliability tests, privacy checks, full repository
  verification, production-readiness gate, and exact-head CI.

### Story P0.3 — prove a fresh connection through the existing app

- [x] Deploy the exact verified revision disabled first, prove both routes fail
  closed with the fixed Container inactive, then enable the same revision.
- [x] Pass the anonymous edge probe and authenticated read-only shopping-list
  and one-result favourite checks without any basket or saved-list mutation.
- [x] Restore exactly one canonical `Nemlig Assistant` connector after
  removing the demonstrated stale registration; do not retain a parallel app.
- [x] Have the owner complete the one required Auth0 consent flow for the
  canonical CIMD client.
- [x] Complete fresh ChatGPT conversations that invoke only authenticated
  `get_profile`; no provider or business operation was performed.

### Story P0.4 — retire the legacy Mac tunnel after cloud-only acceptance

- [x] Inventory the inactive legacy tunnel services and record a recoverable
  removal plan without exposing credentials or changing the running service.
  On 2026-09-05, `com.mortenbroesby.nemlig-tunnel` and
  `com.mortenbroesby.nemlig-auth0-tunnel` were loaded with zero active processes,
  one failed run each, and `EX_CONFIG`; both still referenced the already-removed
  repository tunnel script. After P0.3, boot out only these two labels, move the
  two mode-`0600` plist files to Trash for recovery, then verify the labels stay
  absent before running the cloud checks.
- [ ] After P0.3 passes, remove only the confirmed inactive legacy services.
- [ ] Re-run Worker health, OAuth metadata, and authenticated read-only checks,
  then record the cleanup outcome and close this epic.

This item does not authorize any Nemlig basket mutation.

## P0 — require fresh product data before an approved basket write

**Status:** Active safety fix.

**Epic outcome:** Ensure an approved addition or replacement cannot write from
product details retained during discovery or review; every affected product must
be freshly resolved after apply begins, or the proposal fails closed.

### Story P0.F1 — separate reusable discovery from authoritative revalidation

- [x] Add one exact-product client path that bypasses remembered products while
  reusing the existing bounded upstream search, timeout, and retry behavior.
- [x] Keep discovery and proposal preparation on the existing reusable lookup.
- [x] Prove a populated product map cannot satisfy the fresh lookup.

### Story P0.F2 — fail closed before any mutation

- [x] Revalidate every addition line and both replacement products inside the
  existing mutation lock before the first basket write.
- [x] Invalidate the proposal without mutation when fresh lookup fails or any
  reviewed identity, availability, package, price, or total changes.
- [x] Preserve proposal expiry, basket fingerprinting, single-attempt mutation,
  sequencing, and final basket readback.

### Story P0.F3 — deliver and prove the safety fix

- [x] Update focused tests, implementation documentation, OpenSpec tasks, and
  package version without adding a service, cache, dependency, or background job.
- [x] Pass strict specs, privacy, focused tests, `pnpm verify`, package smoke,
  and the disabled Cloudflare dry-run.
- [x] Integrate the exact commit into remote `main` and verify exact-head CI.
- [x] Deploy the exact CI-green revision disabled first, prove no backend wake,
  restore enabled state for the same revision, and pass credential-free probes.
- [ ] Sync and archive the completed OpenSpec change, then integrate and verify
  its repository-only archival commit.

This item does not authorize a live proposal apply or any basket mutation.

## P1 — predictable automated production deployment

**Status:** The lease, journal, recovery, and automatic-retention design was retired by the owner on 2026-10-07 and is being replaced by the routine-only serialized deploy in `remove-production-release-leases`. The previous live-acceptance and cleanup gates no longer authorize rebuilding that machinery; issue #96 still needs an explicit disposition after this change lands.

**Epic outcome:** An approved green merge to `main` is the routine deploy action.
The protected workflow builds, deploys, and verifies the exact SHA. Failed or
interrupted deployments require manual state inspection; image and Worker
history are left untouched.

### Story P1.D1 — automatically admit and serialize approved releases

- [x] Use successful trusted main-CI runs to trigger routine delivery; keep production
  credentials out of pull-request jobs and inside the protected environment.
- [x] Revalidate exact SHA provenance and prevent stale or queued candidates
  from overwriting newer production.
- [x] Serialize hosted deployment with GitHub Actions concurrency. The former
  shared remote lease was removed on 2026-10-07.

### Story P1.D2 — automate deploy and read-only acceptance

- [x] Replace historical cutover inputs with one routine workflow path; all
  recovery dispatch and persistent release state were retired on 2026-10-07.
- [x] Historical implementation: protected reconciliation for a saved pending
  rollback. Superseded on 2026-10-07 when the owner retired recovery and
  durable deployment state.
- [x] Preserve bounded runtime acceptance and the manual kill switch,
  authentication-before-wake, EU `lite` placement and one-Container ceiling.
- [ ] Prove the exact merged SHA reaches live read-only acceptance. This
  remains a separate issue #96 delivery question and no longer depends on
  reconciling a saved journal.

### Story P1.D3 — retain images safely and make evidence recoverable

- [x] Use only the native serialized GitHub Actions queue; do not add custom
  queue-overflow or catch-up machinery.
- [x] Add exact-repository image inventory, accepted-image ordering, dry-run
  reporting, and fail-closed cleanup with durable delete intent/readback; prune
  to ten accepted images immediately after deployment acceptance.
- [x] Pass focused failure-path tests, strict specs, privacy, `pnpm verify`,
  package smoke, and credential-free production readiness.
- Automatic image and Worker-version cleanup is retired. Do not resume these
  historical tasks without a new separately reviewed design.
- [ ] Reconcile issue #96's remaining delivery question after the routine-only
  workflow lands; image/Worker retention is retired and is not a release gate.

## P1 — prove the kill switch and cost-containment safety net

**Status:** Not started.

- Add an owner-authorized repeatable drill that disables production, proves
  both routes reject before authentication, Durable Object dispatch, or
  Container wake, restores the exact prior state, and verifies health.
- Make interruption recoverable and report the last verified state instead of
  guessing whether production is enabled.
- Compare live configuration with the repository contract: one `lite`
  Container, sleep policy, manual kill switches, CPU/subrequest limits, retry bounds, deadlines,
  and bounded log retention; the current authentication investigation
  temporarily uses 100% head sampling without changing those safety limits.
- Add regression tests that fail if authentication no longer precedes wake, the
  kill switch permits backend dispatch, retries amplify, capacity increases,
  or terminal safety evidence is absent. App-local quotas were explicitly removed
  by #151/#152; this drill must not restore them.
- Produce a conservative daily and monthly cost envelope from configured
  maximums and current provider pricing, clearly separating hard technical
  ceilings from delayed alerts and recurring charges.
- Add a low-traffic scheduled read-only drift audit and define which breaches
  only alert, open the breaker, or require owner-approved kill-switch action.

Done means a recorded drill proves disable, no wake, exact restoration, and
post-restore health, and the owner accepts the documented worst credible cost.

## Retired — application-owned automatic grocery runs

**Status:** Historical implementation, superseded by PR #95's planner retirement
and the current conversational discovery/local-review workflow. The following
describes the old feature, not a pending task to restore its tools or automatic
submission authority.

- Automatic mode resolves up to 50 lines by default and leaves only unclear or
  explicitly manual choices for the user.
- An explicit same-run “go ahead” covers only unchanged clear additions; all
  destructive actions retain exact separate approval.
- Candidate evidence includes Nemlig product description, item details,
  package, price, availability, and approved direct image when supplied.
- Family identities use independent encrypted credentials and isolated state
  under the current strict policy; usage tiers and budgets no longer exist.

## Retired — tiered access and usage budgets

Superseded by #151/#152 and `remove-nemlig-local-rate-limits`. The maintained
contract is explicitly configured family identities with independent encrypted
credentials and account/conversation isolation. No app-local operation quotas,
class caps, tier labels, reserves, shedding or usage forecasting remain. Any
future public/multi-tenant usage policy requires a separately approved design.

## P1 — make product wording reliably reach Danish catalogue search

**Source:** [GitHub issue #7](https://github.com/mortenbroesby/everyday-assistants/issues/7)

**Status:** Active.

**Epic outcome:** Reliably turn ordinary product wording into one bounded Danish
catalogue query that finds relevant current candidates without favourites
fallback, speculative request amplification, or basket changes.

### Story P1.W1 — reproduce and specify the translation boundary

- [x] Reproduce the reported case against the live read-only catalogue. On
  2026-09-05, `Prince cookies` returned unrelated cookies while `prince kiks`
  returned product `904013`, `Kiks m. kakaocremefyld`, brand `Prince`, first.
- [x] Confirm that brand-only `Prince` is ambiguous because it also returns
  tobacco products, so the query must preserve the brand and add the Danish
  grocery category.
- [x] Specify English, mixed-language, misspelled, and over-specific examples
  and require one best Danish phrase per line; ask when meaning stays uncertain.

### Story P1.W2 — enforce the agent and tool contract

- [x] Update server instructions, direct-search metadata, and plan-line schema
  guidance to translate or normalize before the tool call.
- [x] Preserve one catalogue search per line, explicit ambiguity, distinct
  discovery-unavailable and empty-result outcomes, and zero favourites calls.
- [x] Add contract tests for all four wording classes and the reported Prince
  case without introducing a translation service or additional provider calls.
- [x] Update the implemented feature documentation and package version.

### Story P1.W3 — deliver and prove the fix

- [x] Run focused interface/planner tests, privacy checks, `pnpm verify`, the
  production-readiness gate, and strict specification validation.
- [x] Commit and push the scoped item, verify remote `main` and exact-head CI,
  then deploy the exact revision disabled first and enable the same artifact.
- [ ] Refresh the one existing `Nemlig Assistant` app and verify the reported
  wording through a fresh read-only ChatGPT conversation with no favourite or
  basket mutation.

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

## Remove saved plans and named shopping lists

**Status:** Owner-approved removal; source delivery and live acceptance tracked in
[remove-saved-shopping](../../openspec/changes/remove-saved-shopping/proposal.md).

Remove all eight persistence tools and their application/storage adapters. Keep
same-conversation planning and exact basket operations. Existing saved
records and the retained inactive storage namespace remain untouched; cleanup
would be a separate data decision. Future native Nemlig-list support is deferred.
This supersedes the earlier named-list and saved-plan retirement/migration plan.

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
  approving one. Clear lines can continue automatically only when the user
  explicitly authorized that same run.

The meaning of "substantial" and handling for incomparable package units need
real examples before implementation; avoid inventing a complex scoring model
until then.

## Future family access

The hosted alpha remains one owner and one Nemlig account. A later release may
allow explicitly invited family members to sign in with their own identity and
link their own Nemlig account. Do not share the owner's credentials, basket,
sessions, proposals, or approvals, and do not build multi-user infrastructure
until a second real user is ready to onboard.

## Custom presentation

**Status:** Implemented in the current lightweight shared product viewer.

The local workspace uses In Review and Ready, contextual alternatives and exact
protected submission. The separate visual basket action presents the actual
Nemlig basket read-only. Structured/text results remain usable without a viewer.
Native historical-card acceptance remains #137; do not infer it from local
browser smoke or returned image URLs.
