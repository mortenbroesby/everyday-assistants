## Why

The current Nemlig Assistant can plan a bounded list and safely apply an exact basket proposal, but normal requests such as “use the last shopping list and just go ahead” do not reach that complete flow. ChatGPT instead exposes unnecessary product-choice and approval steps—or, when it cannot find the workflow, routes the request into feature reporting—so the user cannot delegate an ordinary grocery run in one instruction.

## Goal

Let an authenticated user authorize an automatic grocery run in the initial request, select suitable current products with useful catalogue evidence, add all sufficiently clear matches, verify the basket, and receive a concise coverage summary without further prompts.

## Non-goals

- Do not add checkout, payment, order placement, or delivery-slot changes.
- Do not weaken principal isolation, hard product constraints, fresh product and basket revalidation, single-use mutation handling, post-mutation readback, the kill switch, global cost ceilings, or other fail-closed controls.
- Do not claim that a deterministic matching heuristic is a calibrated probability.
- Do not add a model service, image proxy, new Container, queue, scheduler, or paid dependency.

## What Changes

- Add automatic and manual grocery-run modes. Automatic is the default; manual choice appears only when explicitly requested or when no candidate is sufficiently clear.
- Let the user’s initial explicit instruction to proceed authorize the resulting bounded additions, even though exact current product and price details are resolved afterward. **BREAKING:** this replaces the requirement that every exact SKU, quantity, and price be approved after proposal preparation for this narrowly scoped automatic-addition flow.
- Send bounded candidate evidence already available from Nemlig—including name, brand, package size, price, availability, description when present, and direct product image URL when present—to ChatGPT and the existing picker so product intent can be compared accurately.
- Automatically select only candidates that satisfy every hard constraint and meet a deterministic clarity rule. Keep unclear lines out of the mutation and return them for manual choice.
- Replace the twenty-line grocery-run and additions-review ceiling with the existing fifty-line named-list ceiling, while retaining bounded candidates, concurrency, deadlines, retries, payloads, and global admission controls.
- Keep Tier 0, Tier 1, and Tier 2 identity labels and isolation, but give all three the same configured admission allowance for now. **BREAKING:** this removes Tier 0 reserved capacity and tier-ordered shedding while global safeguards remain authoritative.
- Report verified basket results with matched, covered, added, skipped, and unclear counts plus an automatic coverage percentage; do not present heuristic match grades as probabilistic confidence.

## Acceptance Criteria

- Given a recipe, current conversation list, or named shopping list, when the authenticated user says “just go ahead” or equivalent, the assistant completes all sufficiently clear basket additions without another approval question.
- Automatic mode is used when the user does not request a mode; manual mode shows candidates without applying additions until the user chooses and authorizes them.
- Multiple candidates do not by themselves force a prompt: a deterministic clear winner may be selected from rich current catalogue evidence, while a close or unsuitable result is held back.
- A grocery run of up to fifty lines can complete in one user-visible flow without the former twenty-line rejection.
- All tiers receive the same configured allowance, while authentication, per-principal isolation, kill switch, one-Container maximum, global breakers, deadlines, and hard cost ceilings still win.
- Every attempted addition is freshly revalidated, single-use, and followed by basket readback; partial or indeterminate outcomes stop immediately and are reported accurately.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Make automatic selection the default, define manual and ambiguity behavior, enrich candidate evidence, expand a run to fifty lines, and report coverage.
- `nemlig-basket-proposals`: Allow initial scoped authorization to cover the resolved automatic additions while preserving proposal invariants, revalidation, single-use handling, and readback.
- `nemlig-tiered-access`: Give all three tiers equal admission allowances without changing the global cost ceiling or principal isolation.
- `nemlig-chatgpt-integration`: Route recipe, conversation-list, and named-list “go ahead” intent through one automatic grocery run with no redundant questions.
- `nemlig-mcp`: Expose the mode, evidence, authorization, and result semantics accurately through the existing compact tool surface.

## Impact

- Affected runtime areas are the Nemlig planning and ranking model, named-list resolution, MCP tool schemas and instructions, picker rendering, proposal authorization, tier-policy validation/admission, tests, package metadata, and operating documentation.
- Product descriptions and image URLs remain current upstream catalogue data; images load directly from approved HTTPS origins and are not proxied or stored by Cloudflare.
- Raising one run from twenty to fifty lines can increase upstream catalogue and revalidation calls. The implementation must reuse the existing bounded worker pool and global admission envelope, document the worst-case call count and deadline, and stop before provider mutation if those bounds cannot fit the accepted cost ceiling.
