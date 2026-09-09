## Why

Ordinary grocery planning can currently surface semantically wrong products, rank package sizes without considering the requested amount, and treat lowest price as the default even where a familiar brand is a meaningful preference. This makes automatic selections feel arbitrary and forces users to correct avoidable choices.

## What Changes

- Exclude catalogue candidates that do not match the requested grocery category, including pet food for a human minced-meat request.
- Let a grocery line express a requested amount and unit separately from the number of packages, and rank package combinations by sufficient coverage with limited excess before price.
- Let clients supply explicit preferred brands learned from the conversation, and rank exact preferred-brand matches ahead of generic price preferences.
- Leave a line unresolved and offer a bounded choice when several materially different brands or package combinations remain plausible.
- Keep planning read-only and keep preference memory in the client conversation; do not add assistant-side preference or shopping-list storage.

Goal: make the first suggested product set relevant, quantity-aware, and aligned with stated household preferences while preserving meaningful user choice.

Non-goals: learning preferences without an explicit user signal, maintaining a server-side category taxonomy, changing favourites, mutating the basket, or choosing a premium brand merely because it costs more.

Acceptance criteria:

- A search for minced meat never returns cat food as an eligible candidate.
- A request for 1 kg can compare combinations such as 2 x 500 g and an available 800 g pack, reporting coverage and excess rather than treating the request as one package.
- An explicit Heinz preference ranks matching tomato ketchup first.
- A choice is requested only when the remaining options differ materially and no explicit preference resolves them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Require semantically relevant candidates, requested-amount coverage, explicit preferred-brand ranking, and bounded unresolved choices.
- `nemlig-mcp`: Expose requested amount, package-combination evidence, preferred brands, and meaningful-choice reasons through the existing planning contract.

## Impact

The change affects the Nemlig planning schemas, candidate filtering and ranking, automatic clarity calculation, MCP structured outputs and descriptions, focused tests, and user-facing feature documentation. It adds no dependency, provider mutation, persistent storage, retry, request amplification, or paid service.
