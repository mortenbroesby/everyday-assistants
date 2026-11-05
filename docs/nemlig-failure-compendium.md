# Nemlig failure compendium

This is a learning record for observed failures and usability friction in
ChatGPT-hosted Nemlig flows. It helps future regression runs check known failure
modes; it is not an exhaustive prediction of failures or proof that an
unobserved path is safe.

Keep entries append-only in meaning: preserve first-occurrence evidence and
prior status when adding a recurrence or resolution. A later fix can change the
current status, but it must not rewrite an unknown historical cause as
confirmed. Use sanitized commit, PR, date, and test references. Never include
conversation links, browser profiles, credentials, raw provider bodies, product
IDs, or shopping data.

## Recording rules

- Use **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** for each applicable
  failure ID on every regression run. Include a short evidence reference. For
  **BLOCKED** or **NOT RUN**, state why and what evidence is missing.
- Mark an ID **N/A** only with a specific reason, such as a run that did not
  reach the relevant surface. Do not silently omit IDs.
- Record first occurrence, every recurrence, current status, last tested
  revision/date, and the next investigation. Distinguish observed facts,
  confirmed code behavior, and hypotheses.
- A generic error, unchanged basket, product presence, HTTP success, or later
  recovery response does not establish the original provider outcome.
- Never retry an uncertain provider write to reproduce a failure. Use synthetic
  tests for retry, uncertainty, and recovery behavior. A real basket write is
  outside a regression run unless separately authorized for an exact payload.
- Preserve sanitized run records locally when they contain sensitive details;
  link only safe repository revisions or PRs here.

## Known failures and observations

### NEM-CHATGPT-001 — Renderer absent from installed action catalog

- **Observed symptom and impact:** On 2026-10-24, the installed ChatGPT action
  catalog exposed 10 actions and omitted the draft renderer. A refresh completed
  but the renderer remained absent, so native UI acceptance failed.
- **Confirmed cause vs unknown:** On 2026-10-25, a bounded refresh returned the
  current 11-action catalog including the renderer. The original stale catalog
  cause is **unknown**; do not attribute it to cache, rollout, or registration
  without evidence.
- **Evidence:** Sanitized native run record, 2026-10-24/25; PR #348 and deployed
  revision `4ffc53393afed72dbf5efc1dcf824c7f93e995cc` for the earlier missing
  action; current acceptance run at PR #349 revision
  `6b2436c8334982e141b923ccb589a6e62d0f001a`.
- **Recurrence test/assertions:** Inspect the actual fresh `tools/list` response
  and the installed ChatGPT action catalog separately. Assert the renderer is
  advertised with its current UI resource metadata. A completed refresh button,
  server revision, package contents, or synthetic test alone is insufficient.
- **Status:** Resolved for the observed 2026-10-25 run; historical cause
  unresolved.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** Recheck only if the renderer disappears again; capture
  sanitized refresh response and compare host catalog with the server catalog.

### NEM-CHATGPT-002 — Draft recovery used misleading saved-list wording

- **Observed symptom and impact:** On 2026-10-24, an edit failure left the
  native card read-only and used “shopping list” wording for a temporary draft.
  A later display request without the original exact handles could not retrieve
  that draft, leaving its state unclear.
- **Confirmed cause vs unknown:** PR #349 corrected the misleading recovery
  wording and exact-target recovery behavior. The original server/context reason
  that the later request could not retrieve the draft remains **unknown**; the
  later request did not contain enough information to prove the original draft
  was lost.
- **Evidence:** Sanitized native run record, 2026-10-24; fix in PR #349,
  deployed revision `6b2436c8334982e141b923ccb589a6e62d0f001a`.
- **Recurrence test/assertions:** Force a synthetic edit failure and verify the
  card explains that the temporary draft needs review, preserves the exact
  draft/context handles, and does not silently create or select a saved list.
  Test recovery with those exact handles; separately verify stale/missing
  handles fail honestly.
- **Status:** Resolved in PR #349; historical draft-availability cause
  unresolved.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349); the
  quantity edit succeeded in the fresh run.
- **Next investigation:** None unless the same failure recurs; capture exact
  sanitized tool/action and handle-presence evidence before assigning a cause.

### NEM-CHATGPT-003 — Direct bulk submission became uncertain without observed quantity increase

- **Observed symptom and impact:** On 2026-10-25, one authorized bulk-submit
  action ended in a generic unconfirmed modal. A later independent read showed
  no observed quantity increase. The server draft recorded submission attempted
  and uncertain. No retry was made.
- **Confirmed cause vs unknown:** Backend dispatch-claimed uncertainty is
  confirmed. Whether the provider accepted, rejected, or timed out the request,
  or whether a later readback failed, remains **unknown**. The unchanged read
  alone does not prove that no write was dispatched or applied. Source review
  also confirmed that the client maps POST exceptions to a generic unconfirmed
  result, so the app-level failure may not retain the provider status/category.
  This diagnostic limitation does not establish the incident’s provider cause.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision
  `6b2436c8334982e141b923ccb589a6e62d0f001a` (PR #349). No private payload,
  product identifiers, or conversation reference is retained here.
- **Recurrence test/assertions:** Synthetic fault tests should cover provider
  rejection, lost response, and failed readback separately. Each must preserve
  the no-replay fence and expose a safe stage/category. A native retry is
  prohibited for regression purposes. A future authorized live run must verify
  exact per-line quantity deltas against an independent pre-submit baseline.
- **Status:** Unresolved; provider outcome and root cause unknown.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** PR #350 implements safe future-failure diagnostics
  and overlapping-product fault regressions. The original response cannot be
  recovered from those changes. After review/deployment, verify the behavior
  with a new exact authorized operation and capture started before Submit;
  never retry the historical uncertain operation. Follow issue #357.

### NEM-CHATGPT-004 — Read-only recovery prompt omitted the quantity baseline

- **Observed symptom and impact:** After NEM-CHATGPT-003, the recovery request
  asked only to inspect the basket and not retry. The response noted the target
  products were present, which did not establish whether this attempt increased
  their quantities. Supplying the baseline later produced a more useful
  “no confirmed addition” assessment.
- **Confirmed cause vs unknown:** The recovery prompt’s omission of baseline
  and expected quantity deltas is confirmed in the UI call path. The provider
  outcome remains the separate unknown described in NEM-CHATGPT-003.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision `6b2436c`
  (PR #349); source review found the direct operation has baseline and approved
  additions while the recovery message does not include them.
- **Recurrence test/assertions:** Synthetic recovery tests must compare each
  item’s before quantity with the expected after quantity, report an
  unconfirmed delta when evidence is insufficient, and retain the no-retry
  fence. Product presence alone must never count as success.
- **Status:** Confirmed defect addressed in PR #350; production/native
  acceptance remains pending. No live retry or mutation was used to fix it.
- **Last tested:** 2026-10-25, service reconstruction and actual MCP/callback/
  storage regression: unchanged baseline one stays unconfirmed; matching
  expected two also stays unconfirmed without a completed receipt.
- **Next investigation:** Verify the deployed native recovery action carries
  the exact draft handle and reports the before/requested/expected/current
  comparison. Missing old receipt evidence must remain explicitly unavailable.

### NEM-CHATGPT-005 — Submission progress was outside the visible scroll area

- **Observed symptom and impact:** The submit action’s loading status was above
  the current scroll position; the button only dimmed. A user could miss that
  submission was in progress.
- **Confirmed cause vs unknown:** The status placement and dimmed button were
  observed. Human inability to scroll or a lost action was **not** established.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision `6b2436c`
  (PR #349); nested scrolling was also observed to hide lower rows and the
  submit action until keyboard scrolling exposed them.
- **Recurrence test/assertions:** Check that progress and the active submission
  state remain visible when the action is below the fold. Keep automation
  limitations separate from human usability findings.
- **Status:** Usability observation; not evidence of a submission defect.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** Review persistent progress placement if the UI is
  changed; do not claim a lost action from the existing observation.

### NEM-CHATGPT-006 — Row edit controls were not discoverable

- **Observed symptom and impact:** Normal rows had no obvious quantity/edit
  action. A quantity badge click did nothing; desktop Shift+F10 exposed actions,
  while right-click did not. Mobile touch behavior was not tested.
- **Confirmed cause vs unknown:** The affordance was difficult to discover in
  the tested desktop UI. Mobile support and broader accessibility impact remain
  **unknown**.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision `6b2436c`
  (PR #349).
- **Recurrence test/assertions:** Check for a visible labeled row action and
  separately exercise keyboard and real touch interactions. Emulation or
  desktop shortcuts do not prove mobile gesture support.
- **Status:** Usability observation; desktop keyboard path worked.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** Recheck when row controls change; run real mobile
  touch testing only in an authorized native session.

### NEM-CHATGPT-007 — Replacement arrow looked like navigation

- **Observed symptom and impact:** The alternative-selection arrow replaced
  the current draft item immediately but looked like a navigation control.
- **Confirmed cause vs unknown:** The visual affordance mismatch was observed;
  no incorrect product replacement was reported.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision `6b2436c`
  (PR #349); replacement completed.
- **Recurrence test/assertions:** Verify the action label or affordance clearly
  communicates replacement before activation and that the exact selected
  alternative is reflected in the draft.
- **Status:** Usability observation, not a functional failure.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** Reassess if alternative selection UI changes.

### NEM-CHATGPT-008 — Interface language differed from the conversation

- **Observed symptom and impact:** The conversation was in Danish, while the
  interface was in English.
- **Confirmed cause vs unknown:** The language mismatch was observed. Language
  selection policy or localization defect was not diagnosed.
- **Evidence:** Sanitized native run, 2026-10-25, deployed revision `6b2436c`
  (PR #349).
- **Recurrence test/assertions:** Record conversation language and visible UI
  language; verify expected localization if language behavior is in scope.
- **Status:** Usability observation; localization cause unknown.
- **Last tested:** 2026-10-25, deployed revision `6b2436c` (PR #349).
- **Next investigation:** Decide language behavior separately; do not treat
  this observation as a provider or draft failure.

## Investigation log — 2026-10-25

Scope: read-only diagnosis of NEM-CHATGPT-003 on deployed revision
`6b2436c8334982e141b923ccb589a6e62d0f001a`. The uncertain addition was **not
repeated**. No application production settings or provider credentials were
changed.

| Evidence plane | Result | What it does and does not establish |
| --- | --- | --- |
| Native UI and independent basket read | Submission became uncertain; no observed quantity increase | Confirms the failed experience, not whether the provider received or applied the original request |
| Durable draft state | Submission attempted and uncertain | The application crossed its dispatch-claim boundary; this is not a provider acknowledgement |
| Retained browser network capture | No matching MCP entries remained when inspected after the failure | Original request/response cannot be reconstructed from this buffer; never replay the write to recover it |
| Browser console and exceptions | Three host-side cache warnings; no recorded JavaScript exceptions | No observed console evidence establishes the submission cause; absence from a retained buffer does not prove absence during the incident |
| Cloudflare historical Worker logs | Initial CLI Observability query returned HTTP 403; later authorized dashboard access found the exact `submit_product_review` invocation and matching terminal event | The event at 13:20:45.920 UTC reports revision `6b2436c`, operation `useful`, denial reason `none`, outcome `completed`, HTTP 200 and 6,907 ms. Gateway authentication did not reject this request. This is **not** the provider POST status or evidence of tool success |
| Cloudflare Container logs | A Containers-only query for 13:18–13:22 UTC returned no events | No retained Container event supplies the provider error; this is not proof that the application encountered no error |
| Auth0 tenant logs | Authenticated dashboard access succeeded through GitHub. An all-log-types search for `date:[2026-10-25T13:18:00Z TO 2026-10-25T13:22:00Z]` returned “No logs match your search” | No retained Auth0 event in this window explains the failure. A cached access token need not generate an Auth0 event for each tool call; absence of events does not prove global authentication health. The matched Worker event independently establishes no gateway authentication denial for this request |
| Client source | `addManyToCart` catches POST errors and replaces them with a generic unconfirmed result; readback failure has a separate generic result | Confirms lost diagnostic detail, not the original provider error/status |
| Recovery source | The follow-up asks to inspect the basket without the operation baseline/expected delta | Confirms NEM-CHATGPT-004; product presence cannot attribute an addition to this operation |

The provider-level root cause remains **unknown**. Do not collapse these facts
into “Auth0 failed,” “Cloudflare failed,” “the provider rejected it,” or “nothing
was sent.” Existing data supports none of those conclusions yet.

### Provider-contract hypothesis and coverage gap

Source review found a concrete gap in what the bulk-add success test proves.
The fixture in `apps/nemlig-assistant/src/client.test.ts` submits 37 new product
IDs while preserving a different existing row. It supplies the expected result
as a mock; it does not exercise a submitted product already in the basket.
The single-product endpoint's overlap test does not establish the bulk
endpoint's behavior.

The bulk request sends requested quantities with `addToExisting: true`, and
`client.ts` requires readback quantities to equal baseline plus requested
quantity. The OpenAPI entry for `/webapi/Basket/AddManyToBasket` explicitly
records first-party request-shape evidence, with live behavior unverified.
Neither the flag name nor the mock proves whether an overlapping product's
quantity is incremented or treated as a target while other rows are preserved.
The failed native run involved overlapping products, making this a plausible
hypothesis, **not a confirmed cause**. Provider rejection, response parsing and
readback failures remain alternatives; the observed HTTP 200 was from our MCP
gateway, not from Nemlig's bulk endpoint.

PR #350 adds the overlapping-product contract regression: baseline one plus
requested one succeeds only with verified two and preserved unrelated rows.
Unchanged quantity and an unrelated decrease fail with no mutation retry. Those
synthetic tests verify our safety behavior, not the live provider contract.

The public first-party bundle at `https://www.nemlig.com/scom/dist/main.js?v=b1.0.0.0`
(inspected 2026-10-25, SHA-256
`608e52fbc904386432c2e7394ffd7396ba224f2facf54a927e28c1856b028d75`)
uses the same endpoint and `{addToExisting: true, Products}` shape in its top-up
flow. It passes the JSON response to a basket updater that checks a top-level
nonempty `ValidationFailures` array. This supports the request shape, but does
not establish the historical outcome or all overlapping-product semantics.
The updater expects basket-shaped data; no empty-response success contract was
established. We therefore do not relax response parsing or invent error-code
mappings. No authenticated provider call was made for this source inspection.

### Next bounded investigation

1. Worker correlation is complete for this submission. Preserve that evidence
   without treating gateway success as provider or MCP success. Use only safe
   scalar fields from [Cloudflare operations](cloudflare-operations.md#inspect-sanitized-operational-evidence);
   platform invocation records can contain request metadata beyond the
   application's closed event schema, so do not export whole records.
2. Auth0 correlation is complete for the same window: no matching tenant
   events were returned. Separate gateway authentication from the provider's
   session and anti-forgery state; do not reconnect or rotate application or
   provider credentials based solely on the generic submission message.
3. PR #350 preserves closed dispatch/readback stage, finite category, known
   HTTP status and optional validation-array presence. Tests cover HTTP,
   network, timeout, cancellation, malformed response, mismatch and body-level
   validation evidence. The MCP emits a scalar-only stderr event; the existing
   owner-scoped receipt is annotated best-effort. A process crash or cancelled
   callback can still prevent annotation. Never log raw provider errors,
   bodies, headers, tokens, cookies, product identifiers or shopping data.
4. PR #350 extends `show_my_basket` with optional exact `draft_id`, using the
   existing owner/account-bound receipt across restart. Compare recorded
   baseline plus actually dispatched additions; skipped products are excluded.
   Legacy receipts are explicitly labeled as reviewed intent. Matching
   quantities alone do not complete an uncertain fence or attribute a write.
   The viewer sends the exact handle rather than asking only about presence.

The implementation and future live acceptance are tracked in [issue #357](https://github.com/mortenbroesby/everyday-assistants/issues/357)
and [PR #350](https://github.com/mortenbroesby/everyday-assistants/pull/350).

A future live run must establish the baseline before the one authorized
addition. Start any authorized bounded capture before the action, and record
only sanitized evidence afterward. Better evidence collection and regression
coverage can catch known modes earlier; they cannot guarantee future failures
will not occur.

## Synthetic regression checkpoint — PR #350

2026-10-25, isolated local worktree. Client fault suite: 76 passed. Runtime
checks cover service, storage, callback, MCP and viewer recovery; the built
iframe smoke verifies the exact draft ID in its conversation message with one
submission attempt. App typecheck, lint and strict OpenSpec validation pass.
These checks use synthetic provider data and do not establish native acceptance.

| Failure ID | Result in this scoped run | Evidence / limit |
| --- | --- | --- |
| NEM-CHATGPT-001 | NOT RUN | No new native ChatGPT tool invocation diagnosis |
| NEM-CHATGPT-002 | PASS (synthetic) | Existing failed-edit exact-draft recovery and isolation in built iframe smoke |
| NEM-CHATGPT-003 | PASS (synthetic); NOT RUN (live) | Overlap, unchanged readback, unrelated row preservation, HTTP/network/timeout/cancellation/parse/validation faults; no retry |
| NEM-CHATGPT-004 | PASS (synthetic); NOT RUN (native) | Actual MCP/callback receipt after restart; exact iframe recovery handle; matching quantities stay unconfirmed |
| NEM-CHATGPT-005 | NOT RUN | Progress placement was not changed or reassessed |
| NEM-CHATGPT-006 | NOT RUN | Real-touch discoverability was not tested |
| NEM-CHATGPT-007 | NOT RUN | Replacement affordance interpretation was not reassessed |
| NEM-CHATGPT-008 | NOT RUN | Localization policy remains separate |

## Run checklist and report template

For every smoke or regression run, copy the IDs below and record an outcome for
each. Add newly observed failures with the next stable ID. Do not mark an
unattempted flow PASS. Follow the native smoke test for authorization and
readback requirements; this checklist does not authorize provider writes.

```text
Run date / tested revision / PR:
Run type: synthetic | native read-only | native write (separately authorized)
Evidence location (sanitized):

NEM-CHATGPT-001 renderer catalog: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-002 draft recovery wording/handles: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-003 uncertain bulk submission: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-004 recovery quantity baseline: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-005 visible submission progress: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-006 discoverable row edit controls: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-007 replacement affordance clarity: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason
NEM-CHATGPT-008 UI language: PASS | FAIL | BLOCKED | NOT RUN | N/A — evidence/reason

New recurrence IDs / first occurrence or recurrence / confirmed facts:
Unknown cause(s) retained as unknown:
Provider writes performed: none | exact authorized scope and independent readback
No-retry fence preserved: yes | no | unknown — evidence
Next investigation:
```
