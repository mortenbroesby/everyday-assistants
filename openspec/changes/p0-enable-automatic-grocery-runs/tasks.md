## 1. Baseline, fixtures, and cost gate

- [x] 1.1 Trace the current recipe/conversation-list/named-list routing through `plan_my_shopping`, `shop_from_my_list`, `review_items_to_add`, and `add_approved_items`; add a regression fixture matching the failed “use the last shopping and just go ahead” conversation and verify it does not call `suggest_an_improvement`
- [x] 1.2 Inspect sanitized representative Nemlig catalogue payloads for a distinct product description and current image origins without recording credentials, sessions, basket data, or raw private payloads; verify fixtures distinguish description from package-size text and reject unapproved image URLs
- [x] 1.3 Add synthetic call-count and timing coverage for worst-case 20-line and 50-line planning, proposal preparation, fresh revalidation, sequential additions, stop-on-mismatch, and readback; verify the 50-line path fits existing deadlines and global operation/subrequest ceilings, or stop for human direction without raising a provider limit

## 2. Automatic and manual planning

- [x] 2.1 Extend the shared shopping-plan schema to 1–50 lines with `automatic` as the default mode and explicit `manual` mode; verify 50 lines pass, 51 fail before external reads, and existing inputs remain compatible
- [x] 2.2 Extend normalized candidates with separate description when present, existing approved direct image URL, package size, and bounded clarity reason codes; verify missing fields stay absent, package size is not relabeled, and no image bytes are fetched or stored
- [x] 2.3 Implement the smallest deterministic clear-versus-unclear selection rule on top of existing constraints and ranking; verify curated exact, unique, clear-winner, close-alternative, hard-constraint, unavailable, and explicitly selected fixtures
- [x] 2.4 Return exact covered, automatically selected, unresolved, and failed counts plus automatic coverage percentage; verify the calculation handles empty categories, partially covered baskets, and 100% clear runs without describing clarity as probabilistic confidence
- [x] 2.5 Raise named-list live resolution to 50 selected lines through the same planner and verify stored lists, current basket-gap behavior, principal scope, and no-mutation reads remain unchanged

## 3. Scoped automatic-addition authorization

- [x] 3.1 Add a bounded `exact_review` or `same_run_automatic` authorization kind to additions proposal preparation and store it inside the existing connection-bound proposal; verify absent, malformed, cross-connection, expired, replayed, and mismatched scopes fail closed
- [x] 3.2 Raise exact additions proposals to 50 unique positive lines while preserving current product/basket fields; verify 50 pass, 51 fail before basket access, and duplicates or invalid quantities still fail
- [x] 3.3 Permit `add_approved_items` to apply a still-valid same-run automatic additions proposal without a second question while retaining the mutation lock, fresh product/price/availability and basket revalidation, single use, stop-on-first-uncertainty, and verified readback; verify changed or indeterminate state never retries
- [x] 3.4 Prove automatic authorization cannot cover unresolved candidates, quantity or constraint changes, later/resumed runs, removals, replacements, clearing, checkout, payment, ordering, or delivery-slot changes; verify every prohibited case performs zero mutation calls

## 4. ChatGPT routing and choice presentation

- [x] 4.1 Update existing MCP schemas, titles, descriptions, annotations, and server instructions so recipe, conversation-list, named-list, and ordinary add intent use automatic planning by default, carry explicit proceed intent separately from search text, and reserve manual mode for requested or unclear choices; verify closed interface snapshots and misleading feature-request routing regression tests
- [x] 4.2 Keep automatic orchestration on the existing `plan_my_shopping` → `review_items_to_add` → `add_approved_items` sequence and verify a fully clear authorized run reaches verified basket readback without another user question or a new direct mutation tool
- [x] 4.3 Update the shared picker to stay out of a fully clear automatic run and render only manual or unresolved lines with accessible text, description and direct image when available, package, price, availability, and text-only fallback; verify keyboard use, image failure, no proxy request, and zero mutation on candidate choice
- [x] 4.4 Add concise final-result presentation for added, already-covered, unresolved, and failed lines plus automatic coverage; verify routine output omits opaque IDs and protocol narration while troubleshooting output remains available on request

## 5. Equal tier admission

- [x] 5.1 Revise tier-policy validation and defaults so Tier 0, Tier 1, and Tier 2 retain labels but use the same minute/day/month allowance and no reserved-capacity or ordered-shedding arithmetic; verify unequal legacy thresholds fail closed rather than silently changing admission
- [x] 5.2 Update admission and forecast tests to prove equal usage produces equal decisions across tiers while counters remain per-principal and authenticated denial still occurs before Container wake
- [x] 5.3 Prove the kill switch, one-Container maximum, global daily and expensive-operation breaker, CPU/subrequest limits, deadlines, bounded retries, and aggregate cost ceiling are byte-for-byte or behaviorally unchanged; verify no tier can bypass a global rejection

## 6. Documentation and release readiness

- [x] 6.1 Update Nemlig operating instructions, basket skill, README feature inventory, tier explanation, automatic/manual examples, 50-line cost model, failure recovery, and backlog status; verify no text still promises a 20-line ceiling, mandatory redundant approval, Tier 0 reserve, or automatic ordering
- [x] 6.2 Apply the required package feature-version decision and update smoke/interface inventories without adding a dependency, service, Container, queue, cron, image proxy, or paid resource; verify version policy and packed-package smoke checks pass
- [x] 6.3 Run focused planner, proposal, MCP, picker, named-list, tier, Cloudflare gateway, production-acceptance, and privacy tests; verify fixtures make no live Nemlig mutation and contain no private shopping or credential data

## 7. Verification, integration, and production evidence

- [x] 7.1 Run `openspec validate p0-enable-automatic-grocery-runs --strict --no-interactive`, the app check suite, `pnpm verify`, the packed-package smoke test, and the credential-free Cloudflare dry run; record exact results and do not weaken a failing gate
- [ ] 7.2 Reconcile sibling-session changes, review the final diff requirement-by-requirement, commit the scoped implementation, push the feature branch, and verify its exact remote ref and exact-head CI without editing unrelated OpenSpec or runtime work
- [ ] 7.3 Before any provider mutation, present the measured 50-line cost/deadline evidence and equal-tier availability trade-off; proceed only if they fit the existing cost envelope and no new cost or setup is required
- [ ] 7.4 Deploy through the existing disabled-first single-Container flow, verify both routes fail closed and the Container stays inactive, enable the same revision, run credential-free and authenticated read-only acceptance, refresh the one existing ChatGPT app in place, and verify no parallel app or infrastructure was created
- [ ] 7.5 With the owner present, run one bounded reversible acceptance using “look at this shopping list and just go ahead,” verify no redundant choice/approval appears for clear lines, verify unclear lines remain unchanged, read back the basket and coverage summary, and record any manual cleanup without checkout, payment, ordering, or delivery-slot mutation
