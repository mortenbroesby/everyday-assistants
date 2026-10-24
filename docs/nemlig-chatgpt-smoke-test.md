# Native ChatGPT smoke test

Use this runbook against a deployed Nemlig Assistant in a fresh ChatGPT conversation. Record each flow as **PASS**, **FAIL**, or **NOT RUN** from observed evidence. A packaged ZIP, local fixture, green CI, or tool response alone does not prove that ChatGPT rendered the current UI. Follow [production readiness](nemlig-production-readiness.md) and keep private product data, conversation links, and credentials out of shared reports.

Product search and temporary-draft edits do not write a Nemlig shopping list or the real basket. Loading an existing saved list uses it as a read-only source. A real basket addition requires separate exact authorization and an independent readback. Do not check out, pay, order, choose delivery, or remove/decrease/clear actual basket contents.

## Before starting

- Record UTC time, deployed commit/workflow, installed plugin version, app ID, browser/device, new conversation, and `ui://nemlig/shell.html` marker. Refresh installed plugin instructions and tools separately when stale; a ZIP merge does not update them.
- Agree on exact products and positive quantities for a bounded test. Search-only requests remain read-only. Do not alter an existing family shopping conversation or select an unrelated saved list.
- Obtain separate approval before any real basket write. Optional whole-basket list save is also a provider write and needs its own authorization. Do not treat permission to test a draft as either approval.

## Flow 1 — Search and temporary draft

1. Search for exact products with `find_groceries`; check returned names, sizes, prices, availability, and IDs. Verify that search alone does not create a draft or provider list.
2. Request visual editing of the chosen exact products. Confirm the tool call is `start_product_review` with `items: [{product_id, quantity}]`, no `creation_id`, and no `shopping_list_id`, then `show_product_review` with the exact returned `draft_id` and `review_context_id`.
3. Confirm the current card renders those products and quantities as a temporary draft from the display result. Record the loading feedback and time to render; the tool result alone does not prove the card rendered.

**Pass:** one editable temporary draft appears, no native list is created, and no basket write occurs. Missing or uncertain UI is reported rather than replaced with an imitation card.

## Flow 2 — Edit and recover the draft

1. In the rendered card, inspect details, alternatives, and close behavior. Check mobile long press or desktop Shift+F10 separately; a desktop shortcut does not prove mobile gesture support.
2. Change an approved quantity, replace one product, and remove one product. Confirm the card reflects the exact result and the saved-list source and real basket remain unchanged.
3. Reload the current card while the draft is active with `show_product_review`. Check the resulting state and error handling. Unprotected drafts expire after two hours of inactivity; unresolved work remains available until resolved. No process-local draft survives a server restart; do not claim persistent edits from this flow.
4. If a draft becomes unavailable, confirm the UI explains it without silently recreating a different draft or restoring submission authority. Start a new draft only from reconfirmed exact products.

**Pass:** local changes remain associated with the exact active draft; an expired or unavailable draft is reported honestly. An error leaves understandable, recoverable UI rather than silently switching products.

## Flow 3 — Existing saved-list source (optional)

With permission to read the exact list, use `start_product_review` with its `shopping_list_id` and no `items` or `creation_id`. Verify the current rows are copied into a new temporary draft. Edit the draft and independently confirm that the saved source is unchanged. List discovery may omit both inputs; it must never auto-select an unrelated list by name.

**Pass:** exact source selection, copied draft contents, and no source-list mutation or deletion.

## Flow 4 — Larger draft (optional)

Only within an agreed scope, prepare 55 distinct product IDs locally. Inspect beginning, middle, and end of the scrollable card, then change an item near the end. Virtualized off-screen rows need not all be in the DOM. Record counts and elapsed time; do not infer scale performance from a five-product smoke.

## Flow 5 — Separately authorized real basket addition (optional)

Follow the [Nemlig basket contract](../apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md). Do not execute this flow without exact authorization.

1. Independently read the actual basket and retain a private complete baseline. Do not clear it. Ask the owner to avoid concurrent edits.
2. Review every intended `product_id` and added quantity, with names, sizes, and estimated prices. A failed lookup is not proof a product is unavailable.
3. Review the exact additions and obtain authorization before the one direct **Add to Nemlig basket** action, unless an existing instruction already authorizes that unchanged payload. Search or draft editing alone is insufficient.
4. Add once. The current draft must submit with exact `draft_id`, `review_context_id`, unique `submission_id`, and `reviewed_list: {name, items}`. There is no extra confirmation screen. Independently check each approved line has `after = before + added quantity` and unrelated lines remain unchanged.
5. If offered after verified addition, treat **Save basket as shopping list** as a distinct, optional app action: it saves the whole current basket, including older rows. Do not infer a saved-list ID if the provider does not establish one. Never retry an uncertain save.

**Pass:** exact authorized additive readback and truthful UI outcome. HTTP success or a card message alone is insufficient. On uncertainty, stop writes and inspect the actual basket read-only; never confirm again or reuse the submission as a replay workaround.

## Sanitised result

```text
UTC / operator:
Deployed commit / workflow / installed plugin version:
App / browser / device / fresh conversation / resource marker:
Flow 1 search + draft UI: PASS | FAIL | NOT RUN — count / time / evidence
Flow 2 edit + recovery: PASS | FAIL | NOT RUN — observed changes
Flow 3 read-only saved-list source: PASS | FAIL | NOT RUN — source unchanged?
Flow 4 larger draft: PASS | FAIL | NOT RUN — count / time
Flow 5 basket addition: PASS | FAIL | NOT RUN — exact approval private
  Baseline / approved additions / verified additions / exclusions:
  Unrelated basket quantities unchanged: yes | no | unknown
Optional whole-basket save: PASS | FAIL | NOT RUN — separately authorized?
Mobile long press: PASS | FAIL | NOT RUN — device
Provider writes / unresolved uncertainty / follow-up defects:
```

## Display-routing prompt matrix

Record expected routing separately from what ChatGPT actually selected. For an
unpublished candidate, all observed columns are **NOT RUN**: deterministic
strings and synthetic smoke are not model evaluations.

| Prompt type | Expected tool / outcome | Observed host result |
| --- | --- | --- |
| Direct: “Show my draft” | `show_product_review` | NOT RUN |
| Indirect: “Let me compare them” | display exact active draft | NOT RUN |
| Danish: “Vis mig listen” / “Åbn kladden” | `show_product_review` | NOT RUN |
| Follow-up after edit | display same exact handles | NOT RUN |
| Actual basket: “Show my Nemlig basket” | `show_my_basket` | NOT RUN |
| Text-only explanation | no renderer required | NOT RUN |
| Ambiguous/unrelated display | clarify; do not create or submit | NOT RUN |
| Stale draft | actionable unavailable; no reconstruction | NOT RUN |
| Uncertain submission | display state only; no replay | NOT RUN |

Keep implementation, deployment, native ChatGPT interaction, and provider readback evidence separate. A blocked login makes dependent flows **NOT RUN**.

## Local tool-catalog measurement

The bounded local measurement uses a loopback MCP client in the hosted request
context, captures the actual JSON `tools/list` response bytes, and separately
counts model-visible tools. It performs no external network, provider,
credential, or model call; the MCP transport is loopback-only:

```sh
pnpm --filter nemlig-assistant exec tsx scripts/measure-tool-catalog.ts
```

For the pre-change baseline, archive only
`254789f61bfc73b7791e950e45691c5293ce0a85`, copy the same measurement script
into that archive, link its `apps/nemlig-assistant/node_modules` to this
worktree's already-installed package dependencies, and run the command through
this worktree's `tsx`. This keeps the harness and hosted context constant while
loading the baseline runtime source; remove that bounded temporary archive after
the measurement.

| Revision | Serialized `tools/list` bytes | Model-visible tools | Total tools |
| --- | ---: | ---: | ---: |
| `254789f61bfc73b7791e950e45691c5293ce0a85` baseline | 120,136 | 7 | 10 |
| Final `codex/nemlig-review-display` candidate worktree | 137,824 | 8 | 11 |

The candidate adds 17,688 serialized bytes (14.72%) and one model-visible tool.
This is deterministic catalog evidence only; it does not establish native
ChatGPT routing or rendering.
