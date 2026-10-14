# Native ChatGPT smoke test

Use this runbook against the deployed Nemlig Assistant in ChatGPT. Record each
flow as **PASS**, **FAIL**, or **NOT RUN** using observed evidence. A Storybook
preview, another client's tool call, or green CI does not prove native ChatGPT
behavior.

Product selection now creates a **Nemlig shopping list immediately**. Editing
it changes that provider list automatically. These are real provider writes,
although they do not change the checkout basket. Obtain approval for a bounded
test list and its edits before flows 1–4. Mere approval to search or test a local
fixture does not authorize these writes. Flow 5 separately requires exact basket
addition approval. Never check out, pay, order, choose delivery, or remove,
decrease, replace, or clear real basket contents.

## Before starting

- Record UTC time, deployed commit, successful production workflow, installed
  app identity, browser/device and whether the chat is new.
- Follow [production readiness](nemlig-production-readiness.md). Record the
  stable `ui://nemlig/shell.html` manifest/build marker separately from package
  version. Do not reconnect or rotate URLs to hide failures.
- Use an authenticated isolated browser session; keep credentials private and
  have the owner complete human verification. Do not alter an existing family
  shopping conversation: reproduce its actions in a fresh test conversation.
- Agree on exact initial products/quantities, a recognisable test list name,
  and permitted list-only edits. Never select an unrelated existing list or
  invent permission to delete the test list as cleanup.
- Keep private product data, IDs, conversation links and screenshots local and
  ignored. Publish only sanitised counts, timings, release IDs and findings.

## Flow 1 — Search and create one native shopping list

1. Search for the agreed five products without creating a list. A search-only
   request, particularly one forbidding provider changes, must stay read-only.
2. Request a new shopping list with the approved exact products and quantities.
   Do not submit it to the actual Nemlig basket.
3. Verify one native list is created. Its card shows the correct five products
   and quantities, its native ID is available for subsequent actions, and an
   independent read of that list confirms the contents.

**Pass:** one provider-backed Shopping list renders, with recognisable products,
quantities and prices or explicit unknown values. There are no unsaved draft,
To decide/Ready, manual Save or manual Update stages. A partial or uncertain
create is reported truthfully, without silently creating another list. Record
time to render and the feedback visible while waiting.

## Flow 2 — Product actions and automatically persisted edits

Use the rendered card rather than conversational substitutes for UI controls.

1. Open product details; inspect description/ingredients and return.
2. Open row actions with long press on mobile or Shift+F10 on desktop. Check
   close/Escape and vertical scrolling. A desktop shortcut does not prove the
   native mobile gesture works or avoids ChatGPT gesture interception.
3. Increase one product from one to two. On another product, rapidly increase
   from one to three then decrease to two. Verify provider list readback.
4. Immediately after a quantity edit, find alternatives. Cancel and return:
   the quantity and original product must remain. Repeat and choose the approved
   replacement: only that product changes and its quantity is retained.
5. Remove an approved test product. Confirm the row count and exact native list
   readback. Verify other products remain. No separate Save/Update should be
   necessary for any edit.

**Pass:** each edit is persisted to the same list, with usable feedback and no
actual-basket write. If an error occurs naturally, the card retains visible
context, displays an explanatory modal, and offers a safe read/refresh without
replaying an uncertain write. Do not inject production outages for this smoke.

## Flow 3 — Reload and recover current native contents

1. Record the list ID, latest products and quantities after flow 2.
2. Reload ChatGPT. The original tool snapshot must not become stale editable
   state. The card should refresh that exact list and display the persisted
   replacement, removal and quantities before enabling edits or submission.
3. Ask to reopen the same native list by exact ID without creating another.
4. In a fresh conversation, open native list discovery and explicitly select
   the test list. Confirm its current contents again.
5. If a read fails, record whether a modal explains it and preserves context.
   Missing/deleted lists must not redirect an edit to another list or silently
   recreate a list. Do not delete existing user lists to force this case.

**Pass:** remount and fresh-chat selection recover provider truth without lost
edits, duplicate lists, or restored submission authority. Old cached cards or
retired draft inputs are not proof that current code ran; record that boundary.

## Flow 4 — Optional larger list

Only with separate agreed scope, extend the test list to **55 distinct product
IDs**, normally one each. Do not duplicate products to reach the count. Count
confirmed native contents after each batch, record partial/uncertain outcomes,
and stop rather than replay an uncertain edit.

Scroll beginning, middle and end; inspect and change an approved quantity near
the end, then reload and verify readback. Virtualized off-screen rows need not
all appear in the DOM. Verify complete native counts and visible rows across
scrolling. Record search count and elapsed time; do not invent performance
thresholds or claim a five-product test proves this scale.

## Flow 5 — Optional explicitly authorized basket addition

Follow the [Nemlig basket contract](../apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md).

1. Independently read the actual basket and retain a private complete baseline.
   Do not clear it. Ask the owner to avoid concurrent edits during the transfer.
2. Review the exact native list: product IDs, names/sizes, added quantities,
   known unavailable exclusions and estimated prices. Unknown prices are not
   zero. A confirmed unavailable product may be skipped and reported; a failed
   lookup is not proof that a product is unavailable.
3. Use **Add to Nemlig basket** and stop at confirmation. Opening the review
   must not transfer anything. Obtain approval for the exact intended additions
   unless an existing instruction already authorizes that unchanged payload.
4. Confirm once. Independently verify each approved line has
   `after = before + approved added quantity`, and unrelated quantities are
   unchanged. A success message or HTTP 200 alone is insufficient.
5. Record whether the source list was deleted after confirmed transfer or kept
   with a cleanup warning. Do not retry a completed transfer to fix cleanup.

**Pass:** exact authorized additive readback and truthful UI outcome. Report
partial/uncertain results distinctly. If testing more than 50 additions, at least
51 distinct products must have verified increases to pass that scale claim.
Do not add more products merely to turn a failed count into a pass.

On uncertain transfer or failed readback, stop writes and inspect the native
list and actual basket read-only. Never click confirmation again, reuse a
submission ID, or recreate the same list as a replay workaround. No automatic
cleanup may remove products from the real basket.

## Flow 6 — Post-submission navigation

After verified success, reopen/remount the historical card and use list
selection. It must not restore the completed source as a fresh submittable list.
After uncertainty, the UI must retain the warning and basket-inspection path
without automatically preparing or replaying a transfer. Do not deliberately
attempt another real submission; synthetic tests cover replay and restart.

## Sanitised result template

```text
UTC / operator:
Deployed commit / production workflow:
App / browser / device / new or existing conversation:
Resource URI / manifest marker / installed metadata:
Approval for native test-list creation and edits: recorded privately | absent
Flow 1 search + native creation: PASS | FAIL | NOT RUN — count / time / evidence
Flow 2 automatic edits: PASS | FAIL | NOT RUN — exact observed changes
Flow 3 reload + fresh-chat recovery: PASS | FAIL | NOT RUN — evidence
Flow 4 >50 distinct products: PASS | FAIL | NOT RUN — count / time
Flow 5 real basket addition: PASS | FAIL | NOT RUN — exact approval private
  Baseline / approved additions / verified additions / exclusions:
  Unrelated basket quantities unchanged: yes | no | unknown
Flow 6 terminal-state navigation: PASS | FAIL | NOT RUN — evidence
Native mobile long press: PASS | FAIL | NOT RUN — device
Provider writes / unresolved uncertainty / follow-up defects:
```

A blocked login makes dependent flows NOT RUN. Keep implementation, deployment,
real ChatGPT interaction and actual provider readback evidence separate.
