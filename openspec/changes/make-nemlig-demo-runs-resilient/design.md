## Context

See [proposal.md](proposal.md) for motivation. Product discovery already filters relevance and hard constraints, computes requested-amount package counts, and sorts eligible candidates deterministically. The remaining `automaticCandidate` step rejects the sorted first result whenever several close candidates lack a unique text or amount distinction. This caused the observed 2-of-30 recipe result even though most lines had suitable ordinary products.

The existing in-memory MCP test path already covers plan, same-run authorization, proposal, apply, and readback for one item. The root `pnpm verify` command already invokes the package `smoke` script, so the full-flow gate can reuse these paths without a new runner or dependency.

## Goals / Non-Goals

**Goals:**

- Change one shared selection decision so every caller gets the practical automatic behavior.
- Prove the complete household workflow with one mixed recipe-scale smoke scenario.
- Keep provider call limits, authentication, authorization, and mutation safety unchanged.

**Non-Goals:**

- New ranking scores, machine learning, preference storage, fallback searches, or retries.
- Live basket mutation in CI or routine production acceptance.
- A separate end-to-end testing framework.

## Decisions

### Use the existing ranked candidate list as the ordinary default

`eligibleCandidates` remains responsible for relevance, hard constraints, amount coverage, brand preference, and deterministic ordering. `automaticCandidate` will retain its existing exact, preferred-brand, unique, and amount-specific reasons, then select the first available candidate with a new `ranked_default` reason when no explicit-choice boundary applies.

An explicitly supplied preferred brand with no matching eligible candidate remains unresolved. `require_choice` also remains unresolved unless an explicit preferred-brand match decides it. This keeps the smallest behavior change in the shared calculation path.

Alternatives considered: lowering a score threshold or adding category policies. No score currently exists, and category policies would add speculative data and maintenance before the real failure requires them.

### Extend the existing credentials-free smoke test

Add one recipe-scale case to the package's existing smoke suite. A small in-memory `ShoppingClient` fixture will return deterministic candidate sets for at least twenty lines and maintain an in-memory basket during the MCP proposal/apply flow. The case will assert the plan summary, selected package counts, exclusions, unresolved explicit choice, exact proposal subset, successful apply, and final basket readback.

Alternatives considered: a live Nemlig smoke or a new test harness. A live mutation is unsafe and flaky for required CI; a new harness duplicates the MCP in-memory path already used by the repository.

### Make smoke evidence part of feature completion

The existing root verification chain remains the executable gate because it already calls every workspace's `smoke` task. Repository instructions will state that user-visible feature work must add or update one representative multi-step smoke scenario and report its passing command before completion. This is a process rule plus an executable test, without another CI workflow.

## Risks / Trade-offs

- [A top-ranked product can differ from the user's unstated taste] → Keep deterministic evidence in the result, honor explicit brand and choice inputs, and allow the user to refine preferences in a later request.
- [Broader automatic selection can expose weak relevance filtering] → Preserve the existing relevance and hard-constraint gates and include clearly incompatible catalogue data in the smoke scenario.
- [A large fixture can become noisy] → Keep one table-driven scenario with compact generated ordinary lines and a few explicit edge cases.
- [Deterministic fixtures do not prove live provider availability] → Retain exact-revision read-only production acceptance for deployment; treat provider availability separately from product behavior.

## Migration Plan

1. Add focused failing assertions for ordinary close alternatives and missing explicit-brand matches.
2. Apply the shared selection change and expose the new clarity reason through existing schemas.
3. Extend the existing smoke suite with the recipe-scale MCP flow and update completion instructions.
4. Run focused tests, root `pnpm verify`, package smoke, strict OpenSpec validation, and the credentials-free production-readiness gate.
5. Deploy through the existing pull-request workflow, then run exact-revision read-only production acceptance. Roll back the commit if automatic selections or smoke evidence regress.
