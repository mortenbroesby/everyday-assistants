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
- **Next investigation:** Inspect safe stage/status evidence from the failed
  call, if available; implement focused synthetic regressions before any
  separately authorized live attempt.

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
- **Status:** Confirmed regression candidate; no live retry or mutation used to
  investigate it.
- **Last tested:** 2026-10-25, native recovery observation at deployed revision
  `6b2436c` (PR #349).
- **Next investigation:** Add sanitized operation context to read-only recovery
  and test the quantity-delta comparison synthetically.

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
repeated**. No production settings or credentials were changed.

| Evidence plane | Result | What it does and does not establish |
| --- | --- | --- |
| Native UI and independent basket read | Submission became uncertain; no observed quantity increase | Confirms the failed experience, not whether the provider received or applied the original request |
| Durable draft state | Submission attempted and uncertain | The application crossed its dispatch-claim boundary; this is not a provider acknowledgement |
| Retained browser network capture | No matching MCP entries remained when inspected after the failure | Original request/response cannot be reconstructed from this buffer; never replay the write to recover it |
| Browser console and exceptions | Three host-side cache warnings; no recorded JavaScript exceptions | No observed console evidence establishes the submission cause; absence from a retained buffer does not prove absence during the incident |
| Cloudflare historical Worker logs | Existing Wrangler account access worked; the bounded Observability query returned HTTP 403, API code 10000 | Log access is blocked with this credential; this diagnostic query failure is **not** evidence that the original application request failed authentication |
| Auth0 tenant logs | Not inspected: no authenticated dashboard or log-reader access available to this investigation | Auth0 is neither established nor ruled out as a contributing boundary |
| Client source | `addManyToCart` catches POST errors and replaces them with a generic unconfirmed result; readback failure has a separate generic result | Confirms lost diagnostic detail, not the original provider error/status |
| Recovery source | The follow-up asks to inspect the basket without the operation baseline/expected delta | Confirms NEM-CHATGPT-004; product presence cannot attribute an addition to this operation |

The provider-level root cause remains **unknown**. Do not collapse these facts
into “Auth0 failed,” “Cloudflare failed,” “the provider rejected it,” or “nothing
was sent.” Existing data supports none of those conclusions yet.

### Next bounded investigation

1. Obtain authorized historical log access, then correlate the incident window
   with the deployed revision and Worker terminal events. Use the safe fields
   in [Cloudflare operations](cloudflare-operations.md#inspect-sanitized-operational-evidence).
   Keep exact private correlation material local. HTTP 200 at the gateway is
   not proof of an MCP tool success.
2. Compare Auth0 event timestamps/categories in the same window only when
   access is available. Separate gateway authentication from the provider's
   session and anti-forgery state; do not reconnect or rotate credentials based
   solely on the generic submission message.
3. If existing evidence cannot distinguish POST rejection, transport/abort,
   response parsing, and readback failure, add a narrowly scoped diagnostic
   improvement in a follow-up change. Preserve a closed stage/category, safe
   HTTP status where available, and a correlation reference. Test each category
   synthetically; never log raw provider errors, bodies, headers, tokens,
   cookies, product identifiers, or shopping data. Preserve the no-replay fence.
4. Repair read-only recovery using exact operation evidence and before/expected
   quantity comparisons. Matching quantities alone must not clear an uncertain
   fence or claim this operation caused the change.

A future live run must establish the baseline before the one authorized
addition. Start any authorized bounded capture before the action, and record
only sanitized evidence afterward. Better evidence collection and regression
coverage can catch known modes earlier; they cannot guarantee future failures
will not occur.

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
