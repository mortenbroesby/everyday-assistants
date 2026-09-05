# Nemlig Assistant backlog

## P0 — restore reliable ChatGPT reconnect and add bounded observability

**Status:** Active incident. Track and complete
[GitHub issue #6](https://github.com/mortenbroesby/everyday-assistants/issues/6)
before further demo-dependent feature work.

**Epic outcome:** Restore a repeatably reconnectable, cloud-only ChatGPT app and
close the incident with privacy-safe evidence that identifies the last completed
OAuth boundary without weakening cost or basket safeguards.

### Story P0.1 — make every hosted boundary diagnosable

- [x] Add redacted structured Worker events and correlation IDs for the kill
  switch, authorization, Durable Object dispatch, upstream calls,
  circuit-breaker changes, timeouts, and deployment identity.
- [x] Bound useful-operation evidence by the existing 5,000-per-day breaker,
  sample ordinary public noise at one percent, add no paid log drain, and reject
  sensitive or unbounded fields in tests.
- [x] Publish a reconnect runbook that separates ChatGPT, Auth0, and Worker
  evidence without collecting credentials, tokens, codes, OAuth state, raw
  payloads, or private shopping data.
- [ ] Run one bounded reconnect attempt and record only the privacy-safe Auth0
  category plus matching Worker terminal evidence or a confirmed absence.
- [ ] Identify and document the exact last completed boundary and either the
  incident root cause or the evidenced external blocker.

### Story P0.2 — terminate stalls without amplifying work

- [x] Keep the final 90-second request ceiling, 85-second Container ceiling,
  60-second Nemlig interaction window, and shorter control-plane budgets.
- [x] Keep read retries bounded to an early transport failure and preserve
  single-attempt, indeterminate-result handling for every mutation.
- [x] Preserve the one-Container ceiling, kill switch, circuit breaker, quotas,
  approval envelopes, authentication-before-wake, and fail-closed behavior.
- [x] Verify the focused reliability tests, privacy checks, full repository
  verification, production-readiness gate, and exact-head CI.

### Story P0.3 — prove a fresh connection through the existing app

- [x] Deploy the exact verified revision disabled first, prove both routes fail
  closed with the fixed Container inactive, then enable the same revision.
- [x] Pass the anonymous edge probe and authenticated read-only shopping-list
  and one-result favourite checks without any basket or saved-list mutation.
- [ ] Refresh the one existing app named exactly `Nemlig Assistant`; do not
  create a suffixed, bracketed, numbered, or parallel app.
- [ ] Have the owner complete a fresh Auth0 login through that existing app.
- [ ] Complete two fresh normal ChatGPT conversations that each read shopping
  lists and at most one favourite without creating, editing, preparing,
  approving, applying, submitting, or mutating anything.

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

**Status:** Implementation in progress; production proof pending.

**Epic outcome:** Replace the error-prone manual release sequence with one
explicit, serialized repository command that deploys an exact CI-green `main`
revision disabled first, reuses its Container image when enabling, and always
reports the last verified production state.

### Story P1.D1 — admit only one exact approved release

- [x] Choose an owner-run command instead of a hosted workflow so the current
  Keychain-backed GitHub and Cloudflare sessions remain the credential boundary.
- [x] Require one full commit equal to local HEAD and refreshed remote `main`,
  plus successful exact-head CI, before any Cloudflare mutation.
- [x] Serialize local worktrees and other machines with exclusive local and
  atomic remote leases; never steal an interrupted lease automatically.

### Story P1.D2 — automate the proven fail-closed sequence

- [x] Record and re-check current Cloudflare state, build and upload once with
  `MCP_ENABLED=false`, and prove both routes reject while the Container is
  inactive.
- [x] Enable the same source and image with no Container rollout, preserve one
  `lite` instance and every existing quota, timeout, breaker, route, and binding,
  then run bounded edge and authenticated read-only acceptance.
- [x] On failure, leave the candidate disabled or restore and verify the exact
  starting version; never run a proposal or Nemlig mutation command.

### Story P1.D3 — make evidence recoverable and cost-bounded

- [x] Document the pre-implementation cost model: no new service, dependency,
  hosted secret, scheduled run, CI job, storage, or capacity; each approved
  release uses one image build/upload, one no-rollout enable upload, two disabled
  route probes, bounded acceptance, and small GitHub/Cloudflare state reads.
- [x] Journal only redacted commit, version, timing, check, rollback, and
  last-state evidence beneath the shared Git directory.
- [ ] Pass focused failure-path tests, strict specs, privacy, `pnpm verify`,
  package smoke, and production readiness; integrate exact-head green `main`,
  prove one real approved release, then sync and archive its OpenSpec change.

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

## P1 — add tiered access with family-reserved capacity

**Status:** Implementation in progress. The repository default remains one
enabled Tier 0 owner; Tier 1 and Tier 2 activation remain disabled until a
separately approved real-user isolation exercise proves every boundary below.

Use ascending tier numbers for descending protection. Higher-numbered tiers are
shed first as monthly usage approaches the owner-set cost envelope:

- **Tier 0 — family:** most protected and always receives reserved capacity.
  Other tiers can never consume its allocation or cause it to be shed. Tier 0
  remains subject to authentication, provider availability, the global
  emergency kill switch, and the owner-set hard safety ceiling.
- **Tier 1 — trusted invitees:** receives access while Tier 1 headroom remains.
  It is shed before Tier 0 but after Tier 2.
- **Tier 2 — experimental access:** lowest priority and first to be shed as
  forecast usage or cost approaches a configured threshold.

**Acceptance criteria:**

- Keep the identity-to-tier assignment private, owner-controlled, auditable,
  and changeable without a code deployment. Never commit names, email
  addresses, Auth0 subjects, credentials, or tokens.
- Enforce tier admission, per-principal rate limits, and tier budgets at the
  Worker before Durable Object dispatch or Container wake. A denied tier must
  incur only the cheapest edge path.
- Reserve explicit monthly and short-window capacity for Tier 0. Define Tier 1
  and Tier 2 ceilings so their combined use cannot consume that reserve.
- Calculate current usage plus a conservative month-end forecast, then shed
  Tier 2 and Tier 1 at separately configurable warning thresholds. Restore
  access predictably when the owner changes a threshold or the accounting
  period resets.
- Give denied users a stable, non-sensitive explanation that access is
  temporarily limited by capacity policy; do not reveal household usage,
  spending, identities, or another tier's limits.
- Add tests for tier ordering, reserved-capacity isolation, threshold changes,
  monthly reset, concurrent admission, fail-closed unknown identities, and no
  Container wake after denial.
- Extend cost and safety evidence with per-tier admitted/rejected counts and
  remaining headroom, using bounded aggregate logs without prompts, shopping
  data, identity values, or unbounded cardinality.
- Before inviting anyone, require their own authenticated principal and
  separately linked Nemlig account. Never expose or reuse the family's Nemlig
  credentials, sessions, basket, proposals, approvals, lists, or favorites.

**Safety boundary:** Tiering is progressive load shedding, not a replacement
for the circuit breaker or kill switch. The global hard ceiling must still stop
all tiers when continuing would violate the accepted cost envelope. Tier 0 is
the last tier shed and is protected from guest consumption, but no software can
guarantee access during a provider outage or global emergency shutdown.

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
