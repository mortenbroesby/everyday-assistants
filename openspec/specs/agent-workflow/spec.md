# Agent Workflow Specification

## Purpose

Help repository agents reach the smallest relevant, durable guidance set while
preserving safety and delivery contracts and avoiding runtime-specific policy.

## Requirements

### Requirement: Root guidance provides direct model-neutral routing

The repository SHALL provide a concise root instruction file that links common
task intents directly to the applicable scoped instruction or skill. It MUST
describe responsibilities without requiring a named model, vendor, or persona,
and MUST direct unmatched work to root and nearest-scope guidance without
loading unrelated skills.

#### Scenario: A specialized task is selected

- **WHEN** a task matches a listed OpenSpec, refactoring, roadmap, Nemlig
  production, or Nemlig basket intent
- **THEN** the agent can follow a direct repository-relative link to the
  smallest specialized guidance set

#### Scenario: No specialized route matches

- **WHEN** a repository task matches no listed specialized intent
- **THEN** the agent uses the root workflow and nearest scoped instructions
  without loading every skill

#### Scenario: Runtime capabilities change

- **WHEN** a user or machine selects different models or orchestration support
- **THEN** repository guidance remains valid because it defines responsibilities
  and checkpoints rather than named runtime assignments

### Requirement: Scoped guidance composes without weakening authority

Applicable nested instructions and task-specific skills SHALL add constraints
to root guidance and MUST NOT grant approval for destructive actions, secrets,
material cost, provider or production changes, external-data changes, or a
Nemlig basket mutation.

#### Scenario: Nemlig production guidance is selected

- **WHEN** a task concerns Nemlig production readiness or deployment
- **THEN** the agent loads Nemlig-scoped instructions and the production skill
  while retaining the provider approval boundary

#### Scenario: Basket guidance is selected

- **WHEN** a task concerns Nemlig search, review, or a basket operation
- **THEN** the agent loads the basket skill and retains its distinct mutation
  approval and readback requirements

### Requirement: Routing value is evaluated proportionately

The repository SHALL record representative task routes, compare always-loaded
guidance size, and distinguish static discoverability evidence from end-to-end
task success. Broken direct routes MUST be detected before delivery. Future
guidance expansion MUST be justified by observed task outcomes rather than
catalog size or theoretical completeness.

#### Scenario: The revised router is reviewed

- **WHEN** representative repository tasks are evaluated
- **THEN** each task has one expected shortest route, unrelated skills are not
  required, and every linked guidance file exists

#### Scenario: More guidance is proposed later

- **WHEN** a future change adds routing or agent workflow machinery
- **THEN** it identifies an observed failure and evaluates task success, human
  interventions, avoidable retries, elapsed time, or total cost

### Requirement: Roadmap uncertainty has focused planning guidance

The repository SHALL provide a planning-only roadmap-triage skill that
reconciles specifications, backlog, branches, worktrees, pull requests, and
delivery evidence before recommending one next epic. It MUST distinguish done,
active, parked, blocked, stale, and historical work and MUST NOT authorize
cleanup, integration, release, deployment, or external mutation.

#### Scenario: The next epic is unclear

- **WHEN** an agent is asked what remains or what should happen next
- **THEN** it produces a concise now/next/later roadmap, dispositions uncertain
  work, and recommends exactly one approval-sized next epic

### Requirement: Friction capture preserves factual evidence
Agents SHALL record meaningful observed developer friction with task, revision, scope, category, severity, sanitized evidence, impact or explicit unknowns, hypothesis, and validation plan. Active records live directly in `.friction/`. Once a fix is verified or a limitation is accepted, agents SHALL append the evidence and move the record to `.friction/archived/`. Records MUST preserve historical observations and distinguish facts from hypotheses. Production incidents SHALL retain their existing canonical record.

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
