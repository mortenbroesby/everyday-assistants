## ADDED Requirements

### Requirement: Representative recipe-scale smoke verification
The repository SHALL provide a deterministic, credentials-free smoke scenario for the conversational MCP path using at least twenty mixed grocery lines. The scenario SHALL exercise ordinary alternatives, a requested amount requiring package calculation, an explicit brand, an incompatible catalogue result, existing basket coverage, one explicit-choice line, same-run automatic authorization, exact proposal preparation and application, and verified basket readback without contacting or mutating Nemlig.

#### Scenario: Recipe-scale automatic run succeeds
- **WHEN** the smoke scenario runs with its deterministic catalogue and basket fixture
- **THEN** every ordinary eligible line is selected or covered, the explicit-choice line remains unresolved, incompatible products are excluded, and the exact selected basket gaps are prepared, applied, and verified

#### Scenario: Authorization differs from selected additions
- **WHEN** the smoke scenario produces a proposal containing a product or quantity outside the current run's selected positive gaps
- **THEN** verification fails before the simulated apply succeeds

#### Scenario: End-to-end behavior regresses
- **WHEN** planning, amount calculation, coverage, authorization, proposal application, or readback no longer satisfies the smoke scenario
- **THEN** the smoke command exits unsuccessfully and identifies the failed stage
