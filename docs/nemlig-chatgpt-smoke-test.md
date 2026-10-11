# Native ChatGPT smoke test

Use this runbook against the deployed Nemlig Assistant in ChatGPT. A Storybook
preview, connector call from another client, or green service fixture does not
prove the ChatGPT interface works. Record each flow as **PASS**, **FAIL**, or
**NOT RUN**, with the observed result. Never fill in an expected result as evidence.

The default is read-only discovery plus Local basket edits. Flow 5 is optional
and writes to the real Nemlig basket only for the exact addition authorized by
the owner. This runbook does not grant standing authorization for future runs.
Never check out, pay, order, choose delivery, or remove/decrease real basket
contents. The owner handles any later removal directly on Nemlig.

## Before starting

- Record UTC time, deployed commit, successful production workflow, ChatGPT
  app identity, browser/device, and whether the conversation is new or existing.
- Follow [production readiness](nemlig-production-readiness.md) for release and
  installed-tool metadata verification. The current resource is
  `ui://nemlig/shell.html`; record its manifest/build marker separately from the
  package version. Do not rotate resource URLs or reconnect to hide a failure.
- Use an authenticated ChatGPT session. For automation, use an isolated PinchTab
  profile, a loopback control endpoint, and a narrow instance host allowlist.
  Keep credentials private; the owner completes sign-in and human challenges.
- Read the actual Nemlig basket and save a private baseline of basket identity,
  exact product IDs, and quantities. Do not clear it. Ask the owner to avoid
  simultaneous edits from other tabs/devices during the addition and readback.
- Agree on the intended products. For the large-list run, target **55 distinct
  available product IDs**, normally one added unit each. Quantities are not a
  substitute for distinct products. The 50-basket inventory limit is separate
  from the 500-distinct-product limit within one Local basket.
- Keep product lists, account data, basket IDs, conversation links, and any
  screenshots in a private test record. Commit only sanitized counts, timings,
  failure descriptions, release identifiers, and public evidence links.

## Flow 1 — Discover products and render a small Local basket

In a fresh ChatGPT conversation with Nemlig Assistant selected, use:

> Find five products from our agreed test list. Show their names, sizes, prices,
> availability, and exact product IDs. Do not add anything to my Nemlig basket.

Inspect the results, then request a new Local basket containing those exact
five products and positive quantities. Name the intended basket explicitly when
other Local baskets exist; do not reuse an unrelated basket silently.

**Pass:** ChatGPT renders one Local basket with five distinct rows, recognizable
products/images, quantities, and line prices or explicit unknown values. No
To decide/Ready tabs or acceptance checkboxes appear. The actual Nemlig basket
still matches the baseline. Text results alone do not pass the rendering check.

## Flow 2 — Tap, swipe, quantities, and alternatives

Use the rendered card, not conversational substitutes for UI actions:

1. Tap a product. Verify full-screen details and the inline trash, alternatives,
   and minus/quantity/plus controls beneath its facts. Close it and return to
   the same list position.
2. Swipe a row **right to left**. It becomes an inline action row with trash and
   alternatives on the left, minus/compact quantity/plus on the right. The rest
   of the list remains visible. Close with ×; also test Escape on desktop.
3. Scroll vertically and swipe left to right. Neither should open row actions
   or unintentionally navigate ChatGPT. Record native mobile behavior separately
   from desktop mouse/trackpad behavior; emulation does not prove touch behavior.
4. Increment a quantity, immediately choose another Local basket, then reopen
   the original. The change must save to the original basket before navigation.
   Restore the intended test quantity locally. If saving fails naturally, the
   edit and original basket must remain visible; do not simulate outages here.
5. Find alternatives. Search, then Back: the original product and quantity must
   remain unchanged. Repeat and explicitly choose an alternative: only that row
   changes, retaining its quantity. Verify both swipe and details entry points.
6. Delete one row locally and restore it through an explicit Local basket edit.
   Check the expected row count after each action. This must not delete from the
   actual Nemlig basket. On desktop, also check Shift+F10 access to row controls.

**Pass:** each action has the expected visible result, unrelated rows/baskets
are unchanged, and a read-only actual-basket check still matches the baseline.
If ChatGPT captures the gesture or hides controls, record the device and exact
step; do not mark swipe as passed because details controls work.

## Flow 3 — Grow beyond 50 distinct products

Use bounded, deliberate searches to find the rest of the agreed list. For example:

> Continue finding products for our agreed test list. Append the exact selected
> products to this same Local basket until it contains 55 distinct products,
> one unit each. Show progress and any unavailable products. Do not submit to
> Nemlig. Do not create a second basket or repeat an uncertain edit.

Count distinct IDs after each append. Do not silently cap the list at 50,
duplicate products to reach 55, or treat a failed search as an empty result.
Choose replacements before the final review and authorization. Record any
search failure, including the search ordinal, without an automatic retry loop.

Scroll the card through the beginning, middle, and end. Open details and change
then restore a quantity near the end. Return to the beginning and verify the
correct rows/quantities remain. Virtualized off-screen rows need not be present
in the DOM; verify the complete data count and visible rows across scrolling.

**Pass:** one Local basket contains 55 distinct products, including accessible
rows beyond position 50, and all intended quantities are retained. Record search
count and elapsed time as observations, not invented performance thresholds.

## Flow 4 — Reopen in an existing and a fresh conversation

Before preparing any addition:

1. Reload/remount the current ChatGPT card. Ask to **show the existing Local
   basket**, not start a new one. Verify its identity, count, and quantities.
2. In a second fresh ChatGPT conversation, ask to show existing Local baskets.
   Select the same test basket explicitly when the host cannot remember a
   selection. Verify all 55 products and the latest quantity edits.
3. Switch between the test basket and a separate small test basket. Confirm no
   delayed result or edit from one replaces the other. Only delete a test basket
   intentionally created for this run; leave pre-existing baskets alone.

**Pass:** durable state survives remount and cross-chat selection without
duplicate baskets, lost edits, or restored submission authority. The inventory
has one Local baskets heading, concise Open/Delete actions, and no redundant
Choose basket action inside the picker itself. Do not wait 24 hours, restart
production, change credentials, or deliberately trigger eviction for this smoke.

## Flow 5 — One explicitly authorized real addition

Run only when the owner intends the real addition. Follow the
[Nemlig basket contract](../apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md).

1. Re-read the actual basket and compare it with the baseline. Resolve any
   external change before proceeding; do not assume exclusive access.
2. Review the exact final Local basket: product IDs, names/sizes, **added**
   quantities, available count, excluded products, and estimated total. Aim for
   55 available distinct products, so the test can verify more than 50 additions.
3. Use the card's **Submit to Nemlig** preparation/review flow. Preparation alone
   must not write. Stop at confirmation and verify the reviewed payload matches
   the intended list. Unknown identity/availability blocks the run; an explicitly
   unavailable product may be excluded and reported. Unknown prices remain
   unknown rather than becoming zero.
4. Obtain the owner's authorization for that exact unchanged list and added
   quantities. Example after review: “Add this exact 55-product Local basket,
   one additional unit of each product, to my Nemlig basket.” An equivalent
   existing exact instruction needs no second conversational approval. Complete
   the UI confirmation once. Any later identity/quantity/scope edit requires a
   fresh review; never reuse stale preparation.
5. Wait for the result, then read the actual basket independently. For each
   approved product, verify `after = before + approved added quantity` (zero
   before only when a complete baseline proves absence). Every unrelated product
   must retain its quantity. Record approved distinct count, verified added
   distinct count, added units, exclusions, mismatches, and outcome.

**Pass:** at least **51 distinct product IDs** have their exact approved positive
quantity increase verified, unrelated contents are unchanged, and the UI reports
the matching outcome. A success message or HTTP 200 alone is insufficient.
Prices are estimates; quantity/identity readback determines addition correctness.
If fewer than 51 can be verified, report the large-list addition as incomplete;
do not silently add more products to turn it into a pass.

If submission times out, reports partial/uncertain completion, or readback fails,
**stop writes**. Inspect the Local basket and actual basket read-only. Do not
click confirm again, retry the tool, restore an old submission ID, or recreate
the same list as a workaround. Resolve the observed result with the owner before
considering any separately reviewed new addition. Do not remove real items as
test cleanup.

## Flow 6 — Post-submission recovery

After a verified success, return to the picker and reopen/remount the historical
card. The completed Local basket must not be restored as a new submittable list;
Choose another basket must work. Check a fresh conversation sees the expected
inventory. Re-read the actual basket after navigation and verify there was no
extra addition. Do not deliberately trigger another real submission.

If Flow 5 ended uncertain, inspect that basket's fence instead: it must remain
inspect/delete-only and must not offer a fresh prepare/retry path. Production
failure injection belongs in a separately scoped test; synthetic regressions
cover outages, cancellation, and restart behavior.

## Sanitized result template

```text
Run UTC / operator:
Deployed commit / production workflow:
ChatGPT app / browser / device:
Installed resource URI / manifest build marker / metadata refresh evidence:
Flow 1 discovery and rendered card: PASS | FAIL | NOT RUN — evidence
Flow 2 controls and alternatives: PASS | FAIL | NOT RUN — evidence
Flow 3 >50 distinct Local products: PASS | FAIL | NOT RUN — count / searches / time
Flow 4 remount and cross-chat recovery: PASS | FAIL | NOT RUN — evidence
Flow 5 authorized actual addition: PASS | FAIL | NOT RUN — authorization recorded privately
  Baseline distinct count / prepared distinct count / approved added units:
  Verified increased distinct count / exclusions / quantity mismatches:
  Unrelated lines unchanged: yes | no | unknown
Flow 6 post-submission recovery: PASS | FAIL | NOT RUN — evidence
Provider writes attempted / verified outcome / uncertainty:
Native mobile swipe: PASS | FAIL | NOT RUN — device and observation
Defects / follow-up issues / remaining untested behavior:
```

Publish only the sanitized result. A blocked login means the dependent flows are
NOT RUN. A desktop pass leaves native mobile touch untested. Keep source fixes,
deployment acceptance, native UI evidence, and actual-basket readback distinct.
