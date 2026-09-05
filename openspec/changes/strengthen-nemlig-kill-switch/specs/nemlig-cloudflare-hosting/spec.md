## ADDED Requirements

### Requirement: Recoverable kill-switch drill

The repository SHALL provide an owner-invoked kill-switch drill that uses immutable Worker versions to exercise the existing earliest `MCP_ENABLED` control. The drill SHALL plan without mutation by default, require explicit live authorization bound to the observed starting deployment and application revision, record only privacy-safe local recovery state, and avoid every Nemlig or saved-state mutation.

#### Scenario: Operator plans a drill

- **WHEN** the operator invokes the drill without live-execution authorization
- **THEN** it performs only read-only preflight, identifies the exact active restoration version and a compatible disabled version, prints the bounded steps, and performs no deployment change

#### Scenario: Safe baseline is absent

- **WHEN** the active deployment is split, its application revision is unavailable, no compatible disabled version exists, the fixed Container shape is ambiguous, or required configuration differs from the repository safety contract
- **THEN** the drill refuses to mutate production and reports the failed precondition without creating a fallback version or weakening a safeguard

#### Scenario: Explicit live drill is authorized

- **WHEN** the owner supplies an execution confirmation that exactly matches the observed starting deployment and application revision
- **THEN** the drill records the restoration target before mutation and changes 100 percent of traffic to the compatible disabled immutable version

#### Scenario: Disabled state is verified

- **WHEN** the disabled version becomes active
- **THEN** both public routes return HTTP 503 with `MCP temporarily disabled` and correlation references, and the fixed Container application reports zero running instances before restoration begins

#### Scenario: Starting version is restored

- **WHEN** disabled evidence passes and the active deployment still matches the version selected by the drill
- **THEN** the drill restores exactly the recorded starting version at 100 percent traffic and verifies deployment identity, health, application revision, OAuth metadata, anonymous rejection, and zero running Container instances

#### Scenario: A drill is interrupted

- **WHEN** an invocation stops after recording or changing production state
- **THEN** a later status or resume invocation reads the sanitized local record, re-observes current provider state, and continues only from a proven compatible phase

#### Scenario: Concurrent deployment drift occurs

- **WHEN** the active deployment changes to a version the drill did not select
- **THEN** the drill performs no further automatic deployment mutation and reports the observed version and last verified phase for owner resolution

#### Scenario: Restoration fails under drill control

- **WHEN** exact restoration fails while the drill-selected disabled version remains active
- **THEN** the service remains disabled and the command exits unsuccessfully with the recorded restoration target and last verified state

### Requirement: Bounded kill-switch evidence and cost

The kill-switch drill SHALL make a fixed, documented number of control-plane inspections, deployment changes, Container inspections, and edge probes. It SHALL add no scheduled work, queue, retry loop, log drain, storage service, dependency, additional Container, or increased limit, and its record SHALL exclude tokens, credentials, headers, raw provider output, request or response payloads beyond the fixed disabled marker, and private Nemlig data.

#### Scenario: Drill completes normally

- **WHEN** a live drill disables, verifies, restores, and verifies the service
- **THEN** it terminates after the documented bounded operations and emits a sanitized summary containing identifiers, timestamps, phases, coarse outcomes, and correlation references only

#### Scenario: Provider operation is ambiguous or times out

- **WHEN** a bounded provider command or probe does not return a parseable conclusive result
- **THEN** the drill performs a fresh bounded read-only state inspection, does not blindly retry a deployment mutation, and reports uncertainty unless the resulting state is proven
