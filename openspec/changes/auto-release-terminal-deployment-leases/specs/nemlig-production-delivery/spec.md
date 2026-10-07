## MODIFIED Requirements

### Requirement: Release ownership and recovery survive runner loss

Every release SHALL have unique operation ownership independent of source SHA and one shared cross-host production lease. Before and after each provider transition it SHALL persist a bounded redacted remote journal of intent and observed state. Concurrent, stale or changed ownership MUST NOT be stolen. A timeout, cancellation or lost response SHALL be treated as an uncertain mutation until provider readback reconciles it.

A protected CI run MAY automatically release its own terminal lease only after the deployment command has stopped, the final bounded evidence artifact has uploaded successfully, and the existing recovery predicate re-verifies the exact journal head plus Worker, configuration, Container image, application version, and instance state. A trusted queued successor SHALL first attempt this same non-mutating reconciliation for a predecessor lease before reporting itself blocked. It SHALL acquire a fresh lease and continue only after deletion is read back and exact-source, ancestry, supersession and protected preflight checks are repeated. This cleanup MUST NOT use age, TTL, force, or an unchecked workflow status as proof, and cutovers awaiting live acceptance MUST retain ownership.

#### Scenario: Two invocations deploy the same SHA
- **WHEN** a second invocation encounters the first invocation's lease
- **THEN** it fails without replacing or cleaning up the first invocation's ownership

#### Scenario: The runner disappears after upload
- **WHEN** provider work may have been accepted but no result is recorded
- **THEN** the durable journal retains the intended transition and starting state, the lease remains, and a fresh invocation cannot repeat the mutation automatically

#### Scenario: Journal persistence fails
- **WHEN** transition intent cannot be durably recorded
- **THEN** the next provider mutation does not occur

#### Scenario: A protected run reaches a verified terminal state
- **WHEN** its deployment command has stopped, its bounded evidence artifact is saved, no live acceptance remains pending, and provider readback matches the exact terminal journal
- **THEN** the same protected job releases only that journal's lease; any missing evidence, pending work, changed head, or provider drift retains it

#### Scenario: A queued successor finds a proven terminal lease
- **WHEN** a trusted queued candidate encounters a predecessor lease whose saved evidence and exact readback prove a terminal release state
- **THEN** it releases only that predecessor lease, repeats its own trusted preflight, and deploys its exact candidate once

#### Scenario: A queued successor finds uncertain predecessor state
- **WHEN** the predecessor evidence is missing, ownership changed, provider state drifted, acceptance is pending, or a mutation outcome is unknown
- **THEN** it retains the predecessor lease, reports the candidate as blocked, and performs no rollout, restore, or rollback

#### Scenario: Another actor changes production
- **WHEN** provider state no longer matches the operation's known deployment during normal progress or rollback
- **THEN** the operation stops and reports drift without overwriting the other actor's version
