## ADDED Requirements

### Requirement: Reliable recipe-sized automatic completion
When an authenticated user explicitly authorizes an automatic grocery run from a recipe or conversation list, the integration SHALL complete the proposal, apply, and verified readback flow for the current run's ordinary selected lines even when catalogue searches contain close alternatives. It SHALL leave only genuinely unresolved lines unchanged and SHALL report them without presenting UI unless the user explicitly requests visual choice.

#### Scenario: Recipe contains ordinary alternatives
- **WHEN** an authorized recipe-sized run resolves several eligible products for ordinary lines but deterministic ranking supplies one selected candidate per line
- **THEN** the integration applies the exact selected positive basket gaps and confirms them after readback without asking the user to choose among those ordinary alternatives

#### Scenario: Some lines require real choices
- **WHEN** the authorized run contains both automatically selected lines and lines marked for explicit choice or lacking required evidence
- **THEN** the integration completes the exact authorized selected additions, leaves the unresolved lines unchanged, and reports only the useful remaining choices without automatically opening UI
