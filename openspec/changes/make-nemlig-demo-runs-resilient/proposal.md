## Why

A real 30-line recipe run safely avoided an authorization mismatch but selected only 2 ordinary ingredients, leaving the demo unable to complete. The planner needs a practical default-selection rule, and feature delivery needs a representative end-to-end smoke test so isolated unit coverage cannot hide a broken household workflow.

## What Changes

- In automatic mode, select the highest-ranked eligible product for an ordinary grocery line after hard constraints, relevance, requested amount, explicit brand, and explicit-choice rules have been applied.
- Leave a line unresolved only when the user requested a choice, an explicit brand or hard constraint cannot be satisfied, no eligible product exists, discovery is unavailable, or the result lacks evidence needed for safe selection.
- Preserve the exact same-run authorization boundary: only products selected from the current request may enter the proposal and apply flow, while unresolved lines remain unchanged.
- Add one deterministic, credentials-free, recipe-scale smoke test that exercises planning, amount/package calculation, partial basket coverage, same-run authorization, proposal application, and verified readback across a mixed multi-line request.
- Require user-visible feature changes to include or update a representative complex smoke path, with the Nemlig production-readiness gate running that path before the change is considered complete.
- Keep live production acceptance read-only by default; this change does not authorize a real basket mutation.

### Goal

Make an explicitly authorized recipe-sized grocery run complete its ordinary lines reliably while preserving hard constraints, meaningful user choices, and exact mutation authorization.

### Non-goals

- Perfect semantic understanding of every catalogue result.
- Learned or persisted household product preferences.
- Automatic fallback queries, unbounded retries, or relaxed hard constraints.
- Checkout, payment, ordering, delivery-slot changes, or any new provider mutation.

### Acceptance criteria

- A deterministic fixture representing a roughly 30-line recipe run selects or recognizes basket coverage for ordinary eligible lines, including requested amounts that require multiple packages.
- Clearly incompatible products remain excluded, explicit brands win when available, and `require_choice` lines remain unresolved.
- The same run prepares and applies exactly its selected positive basket gaps and verifies the resulting basket in the fixture.
- The root required verification gate runs the recipe-scale smoke test and fails if the complete path regresses.
- Repository instructions state that a user-visible feature change is incomplete without a representative complex smoke test and its passing evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Make automatic selection practical for ordinary eligible products while retaining explicit choice and hard-constraint boundaries.
- `nemlig-mcp`: Require a representative recipe-scale planning-through-readback smoke path for the conversational MCP workflow.
- `nemlig-package-distribution`: Include the complex smoke path in the credentials-free production-readiness gate.
- `nemlig-chatgpt-integration`: Define successful recipe-sized automatic completion as the normal demo behavior while reporting genuinely unresolved lines concisely.

## Impact

The change affects the Nemlig planning decision in `plans.ts` or its existing calculation helper, focused planning and MCP tests, the existing smoke suite and root verification command, and repository/app completion instructions. It adds no dependency, storage, provider call, retry, or paid service. Runtime catalogue and basket call bounds remain unchanged.
