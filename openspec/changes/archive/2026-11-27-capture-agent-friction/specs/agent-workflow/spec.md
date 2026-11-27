## ADDED Requirements

### Requirement: Friction capture preserves factual evidence
Agents SHALL record meaningful observed developer friction with task, revision, scope, category, severity, sanitized evidence, impact or explicit unknowns, hypothesis, validation plan and resolution status. Records MUST preserve historical observations and distinguish facts from hypotheses. Production incidents SHALL retain their existing canonical record.

#### Scenario: Meaningful friction occurs
- **WHEN** an agent observes a failed or unnecessarily costly engineering step
- **THEN** it records only supported facts and links the relevant task and subsequent resolution

#### Scenario: No meaningful friction occurs
- **WHEN** a task has no meaningful friction to report
- **THEN** no record or assertion of friction absence is required

#### Scenario: Read-only or interrupted task
- **WHEN** a task cannot write a record within its authority or is interrupted
- **THEN** any available handoff carries the sanitized observation for later authorized capture without expanding permissions

### Requirement: Lifecycle reminders remain advisory
Native friction reminders MUST NOT block completion, force model continuation, inspect transcripts, create records, or infer task success. Unsupported or malformed events SHALL have no effect. Reminders SHALL remain bounded and require native host trust before activation.

#### Scenario: Completion or interruption
- **WHEN** a supported host invokes a trusted reminder for completion or interruption
- **THEN** it emits only a bounded advisory message and does not request continuation or mutate state

#### Scenario: Repeated or malformed event
- **WHEN** an event is malformed, unsupported, or already continuing from a stop hook
- **THEN** the reminder returns a neutral response without exposing input data

### Requirement: Friction improvements use comparable evidence
Improvement evaluation SHALL separate implementation checks from observed agent outcomes and record unavailable measurements explicitly. Records SHALL inform prioritization without automatically becoming requirements.

#### Scenario: Reminder tests pass
- **WHEN** synthetic hook tests pass without comparative agent trials
- **THEN** the report claims mechanical correctness only and leaves behavioral benefit unverified
