## Context

See `proposal.md` for motivation and the delta specs for required behavior. The existing implementation already has the necessary shape: ChatGPT supplies structured grocery lines, the planner searches the catalogue with a three-worker pool, candidates carry normalized factual metadata, an optional picker renders product images directly, and the proposal service revalidates exact additions before sequential mutation and basket readback.

The gap is orchestration. Current instructions call the planner read-only, leave every multi-candidate line unresolved, cap runs and proposals at twenty lines, and require a second exact-detail approval. The named-list workflow can store fifty lines but resolves only twenty. The current product model uses Nemlig `Description` as package-size text and does not expose a separate long description, so implementation must inspect actual sanitized catalogue shapes before claiming one exists.

## Goals / Non-Goals

**Goals:**

- Reuse the current planner, candidate model, picker, proposal store, mutation lock, and readback path.
- Make the normal ChatGPT route automatic-first while retaining an explicit manual mode and useful ambiguity fallback.
- Carry the user’s same-run proceed intent into the exact additions proposal without treating planning itself as approval.
- Keep the externally simple “one request, one result” experience for as many as fifty lines.
- Prove the raised bound fits existing deadlines and cost ceilings before production mutation.

**Non-Goals:**

- No recipe parser or language model inside the server; ChatGPT still converts conversation context into structured grocery lines.
- No image download, proxy, OCR, embedding, similarity model, confidence model, or new dependency.
- No automatic removal, replacement, clearing, checkout, payment, ordering, or delivery-slot work.
- No background continuation after a failure or indeterminate mutation.

## Decisions

1. **Keep the existing compact tool sequence.** ChatGPT uses `plan_my_shopping`, `review_items_to_add`, and `add_approved_items`; no new all-powerful mutation endpoint is needed. The planner input gains `mode`, while proposal preparation gains a bounded authorization kind that is stored with the proposal. The apply path still accepts only an opaque, same-connection, unexpired proposal. A new combined tool was rejected because it would duplicate the proposal service and make failures harder to inspect.

2. **Treat authorization as narrow same-run intent.** `automatic` authorization covers additions derived from the current structured lines, quantities, constraints, and preferences only. It expires with the proposal and does not survive saving, loading, or starting another run. The proposal records whether it came from exact-review or same-run automatic authorization; revalidation compares the same exact product fields either way. Removals, replacements, and clearing keep exact post-proposal approval.

3. **Let ChatGPT interpret recipes and conversation context.** The server receives structured lines rather than raw prompts or recipes. Server instructions explicitly route “use this recipe/list and go ahead” through planning, proposal, and apply instead of `suggest_an_improvement`. This reuses the host model and avoids storing prompts or building a brittle local language parser.

4. **Use factual evidence and a small clarity contract.** Hard constraints remain server-enforced. The planner returns up to the existing five candidates with name, brand, package size, prices, labels, availability, and image URL plus a separate description only if the upstream payload actually has one. A line is automatically selectable when it has an exact supplied product, one eligible candidate, or a top candidate that wins the repository’s deterministic text and preference comparison without a tied material alternative. The result exposes `clear` or `unclear` plus bounded reason codes, not a synthetic probability. Curated fixtures will set the initial text-distance/tie boundary; a single documented calibration constant may remain if real examples show tuning is necessary.

5. **Use images as optional supporting evidence, not a required model input.** Structured results retain approved direct HTTPS image URLs and the picker renders them for a person. ChatGPT may use an image only when its host natively supports that external image reference; the server does not fetch bytes to force visual analysis. Automatic selection must remain correct from text and normalized metadata alone. This avoids a proxy, storage, extra subrequests, and image-origin privacy expansion.

6. **Hide choice UI unless it has work to do.** A fully clear automatic run returns no picker prompt. Manual mode renders every bounded candidate; an automatic run renders only unresolved lines. Text-only clients receive the same evidence and reason codes. This is instruction and presentation behavior over the current shared picker, not a second UI.

7. **Report coverage, not fake confidence.** Coverage is `(already covered + automatically selected) / requested lines`, rounded as a display percentage alongside exact counts. Unresolved and failed lines stay separate. Match clarity remains categorical and reasoned; it is not described as a probability.

8. **Raise the shared line bound to fifty, then prove the envelope.** The planner, named-list selection, review schema, proposal validation, and tests use the existing fifty-line storage maximum. Candidate count stays at five and search concurrency stays at three. Before implementation is considered deployable, focused benchmarks and synthetic call counting must prove worst-case planning, preparation, fresh revalidation, sequential additions, and readback fit the existing request deadline and global subrequest/operation limits. If fifty cannot fit, implementation stops for human direction rather than raising a provider limit, adding infrastructure, or silently returning to twenty.

9. **Equalize tier admission without deleting tiers.** The policy retains tier labels, principal isolation, per-principal counters, and owner-only aggregate reporting. Tier-specific budget fields either validate as the same values or resolve to one shared allowance; reserve arithmetic and ordered shedding no longer affect admission. Global minute/day/month ceilings, conservative forecast, breaker, kill switch, auth-before-wake, and one-Container maximum remain unchanged. This may reduce Tier 0 availability under guest load but does not raise the maximum admitted global work.

## Cost Model

- Current worst-case twenty-line planning performs one basket read plus up to twenty catalogue searches with concurrency three. Proposal preparation performs one basket read plus up to twenty product lookups. Apply performs up to twenty fresh product lookups, up to twenty sequential basket mutations, and final readback, with additional stop-on-mismatch reads in the existing protocol.
- The proposed fifty-line ceiling can increase those line-proportional calls by 2.5 times for one maximum request. It does not add a Container, autoscaling, storage, image proxy, scheduler, or retry loop, and the global admission ceiling remains unchanged.
- The worst credible failure is a maximum automatic run consuming its deadline or upstream allowance partway through sequential additions, leaving a verified partial basket and reduced capacity for other users. Existing stop-on-first-uncertainty and readback contain state uncertainty; the implementation gate must additionally prove the deadline and operation budget or pause for a lower bound/batching decision.
- The lower-cost fallback is a smaller shared ceiling above twenty or an explicitly continued second run. It is not selected now because the requested user contract is one flow up to the existing fifty-line list size.

## Risks / Trade-offs

- [An automatic match is technically eligible but not what the user meant] → Require a clear deterministic result, expose descriptions and images when available, hold close alternatives for manual choice, and summarize every verified addition so the user can remove an unwanted line.
- [A model asserts automatic authorization without corresponding user intent] → Make tool instructions and authorization enum explicit, bind it to the same proposal/run, reject absent or mismatched scope, and cover negative routing fixtures.
- [The provider has no distinct product description] → Preserve package size accurately and omit description rather than relabel or invent content.
- [Fifty lines exceed request or upstream limits] → Measure the exact worst-case calls and duration before runtime delivery; do not raise infrastructure or paid limits without a human cost checkpoint.
- [Equal tiers let invitees consume capacity previously reserved for family] → Record this as an intentional availability trade-off, keep per-principal/global caps, and retain tier labels so differentiated admission can be restored later.
- [Some ChatGPT clients cannot inspect external images] → Keep textual evidence sufficient and use images only as optional user-visible context.

## Migration Plan

1. Add synthetic planner and authorization fixtures first, including representative recipe, conversation-list, named-list, close-match, missing-description, image, fifty-line, and false-authorization cases.
2. Extend normalized candidate evidence and automatic/manual result fields without removing existing fields.
3. Update the existing tool schemas, server guidance, picker visibility, proposal authorization binding, and tier admission logic.
4. Run focused tests, exact call-count/deadline checks, strict OpenSpec validation, package smoke checks, and `pnpm verify`; stop if the fifty-line cost envelope is not proved.
5. Ship through the existing disabled-first one-Container deployment flow only after a later apply request and the normal provider checkpoint. Verify credential-free fail-closed behavior, authenticated read-only automatic planning, then one separately owner-observed reversible basket acceptance before general use.

Rollback disables production first, restores the prior image or code revision and tier policy, verifies fail-closed routes and an inactive Container, then re-enables only the previously accepted version. Basket mutations are never rolled back automatically; verified partial results remain visible for manual correction.
