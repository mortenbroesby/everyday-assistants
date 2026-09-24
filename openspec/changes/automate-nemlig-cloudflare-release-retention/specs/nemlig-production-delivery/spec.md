## MODIFIED Requirements

### Requirement: Routine releases follow an eligible main merge automatically

An eligible successful trusted CI run for a commit still in default-branch history SHALL trigger routine production delivery without workflow dispatch or manual finalization. Production mutations SHALL be serialized with the native Actions queue; the workflow SHALL NOT add custom queue-overflow catch-up machinery. The deploy job SHALL revalidate the exact source and trusted CI provenance immediately before mutation, and a queued candidate SHALL NOT replace a runtime revision that is not its ancestor. Pull-request jobs SHALL NOT receive production credentials.

#### Scenario: An eligible trusted merge remains in current main history

- **WHEN** trusted CI succeeds for a full main SHA that remains an ancestor of current `main`
- **THEN** one protected routine release runs automatically for that SHA without a manual commit selection

#### Scenario: Main advances, a newer release is deployed, or another release owns production

- **WHEN** the candidate is no longer in current main history, a newer revision is already deployed, or another production operation owns the lease
- **THEN** the stale or concurrent operation does not mutate production or replace the owner's recovery state

#### Scenario: A pull request is tested

- **WHEN** untrusted pull-request code runs verification
- **THEN** it has no production credential, deploy, or cleanup authority

### Requirement: Acceptance precedes cleanup and proves the deployed candidate

Routine delivery SHALL verify the exact deployed source revision, health, OAuth metadata, anonymous rejection, and bounded authenticated read-only useful work using the approved isolated service identity. Acceptance SHALL NOT mutate a basket, order, payment, delivery, or user account. Image cleanup SHALL run only after required acceptance and durable evidence succeed.

#### Scenario: Deployment is accepted

- **WHEN** the exact candidate is enabled and all required read-only acceptance checks pass
- **THEN** the release records bounded non-secret evidence and may enter image-retention planning

#### Scenario: Acceptance fails or is unavailable

- **WHEN** any required check fails, times out, or cannot prove the exact candidate
- **THEN** no image is deleted and the release follows ownership-safe recovery

#### Scenario: A bounded acceptance stage fails

- **WHEN** edge/OAuth checks or authenticated read-only useful-work acceptance exhaust their bounded retries
- **THEN** the journal reports a fixed stage-specific failure category without command output, response bodies, tokens, or user data, and cleanup remains ineligible

### Requirement: Release summaries distinguish evidence and cleanup state

The protected workflow SHALL publish a bounded summary that distinguishes
deployment, technical acceptance, owner acceptance, cleanup, and traffic
measurement. CI synthetic acceptance MUST NOT be presented as owner or live-user
proof. Cleanup SHALL be `complete` only when the retention report proves
completion; protected, untracked, unstable, failed, uncertain, dry-run, and
missing-evidence states SHALL remain distinct and the retention command's exit
status SHALL remain authoritative.

#### Scenario: Retention reports protected holds

- **WHEN** accepted deployment evidence exists but active, recovery, uncertain,
  or untracked images remain protected
- **THEN** the summary reports cleanup as held/incomplete with bounded reasons
  and does not claim cleanup completion

#### Scenario: CI has no owner or traffic evidence

- **WHEN** the protected workflow completes its synthetic technical checks
- **THEN** the summary reports owner acceptance as not run and traffic as not
  measured rather than inferring either from configured state

#### Scenario: Deployment mutation occurs before evidence upload fails

- **WHEN** the deployment job fails after provider mutation or its release
  artifact cannot be downloaded
- **THEN** the retention job records deployment acceptance as unknown or not
  accepted, does not clean up images or Worker versions, and preserves any
  recoverable journal as reconciliation evidence

### Requirement: Recovery preserves uncertainty and provider ownership

Recovery SHALL retain only state required to distinguish runner loss before mutation, uncertain provider mutation, verified terminal state, and interrupted cleanup. It SHALL NOT repeat an uncertain mutation or remove an image required by unresolved recovery. Redundant locks, journals, artifacts, or manual finalization MAY be removed only when tests prove equivalent exact-state recovery from remaining durable provider and workflow evidence.

#### Scenario: Runner is lost during a provider transition or cleanup

- **WHEN** the result may have been accepted but was not durably observed
- **THEN** a fresh routine run reconciles read-only state and does not retry or clean up until ownership and exact provider state are proven

#### Scenario: Another actor changes production

- **WHEN** the observed Worker, Container, or release owner differs from the operation's verified state
- **THEN** the operation stops without overwriting the other actor's state
