## ADDED Requirements

### Requirement: Quantity-aware and preference-aware planning contract
The guided planning tool SHALL accept an optional requested amount and supported unit, optional preferred brands, and an optional per-line explicit-choice signal. Its structured result SHALL expose each candidate's relevance, parsed package amount when available, required package count, covered amount, excess amount, preferred-brand match, and the deterministic reason for automatic selection or unresolved choice.

#### Scenario: Client supplies conversational preference
- **WHEN** ChatGPT has an explicit user preference such as Heinz tomato ketchup in conversation or memory
- **THEN** it can pass that brand on the applicable grocery line without creating or updating assistant-side preference storage

#### Scenario: Client supplies a requested amount
- **WHEN** the user asks for 1 kg and the catalogue contains relevant 500 g and 800 g packages
- **THEN** the tool returns both with their required package counts, total covered mass, and excess mass so the client can explain the trade-off

#### Scenario: Meaningful choice is requested
- **WHEN** the client marks a line as requiring explicit choice and no preferred brand produces one clear result
- **THEN** the result remains unresolved with a bounded set of usable candidates and no picker is attached unless the user explicitly asks for visual choice

#### Scenario: Legacy package-count line
- **WHEN** a client supplies only the existing positive quantity
- **THEN** the tool preserves package-count planning behavior and remains backward compatible

