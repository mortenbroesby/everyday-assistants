## MODIFIED Requirements

### Requirement: Routine releases follow an eligible main merge automatically

An eligible successful trusted CI run for a commit still in default-branch history SHALL trigger routine production delivery without workflow dispatch or manual finalization. Production mutations SHALL be serialized with the native Actions queue; the workflow SHALL NOT add custom queue-overflow catch-up machinery. The deploy job SHALL revalidate the exact source and trusted CI provenance immediately before mutation, and a queued candidate SHALL NOT replace a runtime revision that is not its ancestor. Pull-request jobs SHALL NOT receive production credentials.

#### Scenario: An eligible trusted merge remains in current main history

- **WHEN** trusted CI succeeds for a full main SHA that remains an ancestor of current `main`
- **THEN** one protected routine release runs automatically for that SHA without a manual commit selection

#### Scenario: Main advances, a newer release is deployed, or another release owns production

- **WHEN** the candidate is no longer in current main history, a newer revision is already deployed, or another production operation owns the lease
- **THEN** the stale or concurrent operation does not mutate production or replace the owner's recovery state

#### Scenario: A routine candidate finds an existing recovery lease

- **WHEN** source, exact-main CI, and environment checks pass but the shared remote production lease already exists
- **THEN** the workflow records a bounded `blocked_by_existing_lease` result, does not issue a production credential or create a local deployment journal, and skips deploy, finalization, and retention; the summary identifies the candidate and lease head, states that the live revision was not verified, and directs the operator to explicit reconciliation

#### Scenario: A lease appears after preflight

- **WHEN** a remote lease is absent at routine preflight but becomes present before mutation
- **THEN** atomic lease acquisition remains authoritative and the routine operation stops without replacing the lease owner's state

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

#### Scenario: Service tool inventory differs from the expected fixture

- **WHEN** the machine identity can list tools but the exact fixture inventory differs
- **THEN** the failure evidence records only a bounded mask of missing expected tools and count of unexpected entries, without publishing actual tool names or payloads

#### Scenario: A new Worker reaches a previous Container image during rollout

- **WHEN** the enabled Worker reports the candidate revision but the authenticated MCP connection still identifies an earlier backend release, or the candidate instance has not started
- **THEN** an authenticated MCP initialization verifies the server package release without calling tools or reading resources, acceptance waits within a fixed budget for the exact candidate application version to be running, and only then exercises the read-only service fixture; final running-version, Worker revision, image, and lease checks remain required, and any exhaustion fails closed without authorizing image retention

#### Scenario: Final running-instance convergence is diagnosable without widening provider reads

- **WHEN** the final bounded instance gate accepts, times out, receives invalid inventory, encounters a read failure, or observes version drift
- **THEN** it emits one fixed-schema diagnostic containing only the expected version, nullable first and last observed allowlisted state and nullable numeric application version, fixed-key counts by state and version relation (missing, older, expected, newer), poll count, elapsed milliseconds, and fixed result category; absent observations are null rather than an inferred state. Diagnostic output is best-effort and cannot replace the deployment result. It adds no provider reads or retries and preserves the existing 36-read limit, acceptance predicate, rollback, and lease behavior.

#### Scenario: Explicit recovery verifies disabled-route propagation

- **WHEN** a separately authorized emergency-isolation operation intentionally deploys a disabled Worker
- **THEN** the deploy checks both public routes within a fixed retry and time budget; it proceeds only after both return HTTP 503 with the exact disabled response, otherwise it records the bounded failure category and keeps the incident isolated

#### Scenario: A known routine candidate fails read-only acceptance

- **WHEN** a routine candidate's read-only acceptance fails after its exact Worker version, Container image, and starting enabled release have been durably recorded, and the failure is known rather than an uncertain provider mutation
- **THEN** the deployment uses the existing production lease to restore the exact starting Container image by immutable digest and the exact starting enabled Worker version, then reruns read-only service acceptance against the starting revision; it never deploys a disabled Worker as routine failure handling, and the candidate remains failed and is never retained as accepted

#### Scenario: Every non-recovery release deploys enabled

- **WHEN** an exact, authorized routine release runs through either CI service acceptance or the local read-only acceptance path
- **THEN** it deploys the candidate Worker with MCP enabled and does not publish a disabled staging version; disablement is reserved for a separately authorized emergency-isolation operation

#### Scenario: Automatic restoration cannot be proven safe or completes with a failed acceptance

- **WHEN** the starting snapshot is incomplete, lease ownership changes, rollout state is pending/ambiguous, any mutation result is uncertain, the bounded recovery window expires, or restored-release acceptance fails
- **THEN** the deployment does not retry or perform another speculative mutation; it never deploys a disabled Worker for routine failure handling, records provider state as unknown when it cannot be proven, and retains the lease; if the exact prior release was restored but its read-only acceptance fails, leave it enabled and mark acceptance unproven; unresolved cases are not reported as successful recovery

#### Scenario: Routine failure does not use the emergency kill switch

- **WHEN** a routine deploy, instance-convergence check, or read-only acceptance fails
- **THEN** automation never deploys `MCP_ENABLED=false`; disablement requires a separately authorized emergency operation, and an enabled-but-unverified or unavailable service is reported honestly without being called healthy

#### Scenario: An interrupted container failback is reconciled under its lease

- **WHEN** a stopped release runner leaves a `container_restore` intent and the original operation, exact starting image/version, disabled Worker, and current provider state can be read back
- **THEN** protected reconciliation never repeats the rollout POST; it may continue only when authoritative reads show the exact starting image at a newer application version with no active rollout, then restores the exact starting enabled Worker, records bounded evidence, and releases the lease only after read-only acceptance and exact readback

#### Scenario: A restored direct failback resumes after Worker restoration

- **WHEN** exact readback already proves the recorded starting image and Worker were restored, but service acceptance has not yet completed
- **THEN** reconciliation recognizes the complete direct-restore transcript, performs no additional Container or Worker mutation, and reruns service acceptance against the package version recorded at the journal's starting source revision; a mismatched, missing, or invalid source identity retains the lease

#### Scenario: The outcome of an interrupted container restore is unknown

- **WHEN** the candidate image remains current after a `container_restore` intent, including when the provider application timestamp predates that intent
- **THEN** reconciliation records `cloudflare_container_restore_uncertain`, returns `provider_outcome_unknown`, performs no rollout POST, and retains the lease; a timestamp or absence of an active rollout is not proof that the original request was rejected

#### Scenario: Restoration capability is verified before a routine release

- **WHEN** a routine release cannot read back the exact starting image/version, the expected scheduler-backed `default` policy, or a state with no active Container rollout
- **THEN** it stops before any Worker or Container mutation and reports a bounded deployment failure

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

#### Scenario: Enable command takes effect but its result is not journaled

- **WHEN** the original runner is stopped, the saved operation has only an
  `enable_deploy` intent, the exact candidate Worker is enabled, and the
  Container still matches the recorded starting image, application version,
  configuration, and inactive state
- **THEN** protected recovery may roll the Worker back to the recorded
  starting version, verify disabled routes and unchanged inactive Container
  state, append the missing rollback result, and only then release the lease;
  any Worker, Container, configuration, or ownership mismatch retains the
  lease and performs no provider mutation

#### Scenario: Disabled deployment result is not journaled after a route probe fails

- **WHEN** a stopped runner leaves only a `disabled_deploy` intent and read-only evidence proves the current Worker is the exact commit's disabled version, its version-tagged registry image matches the same Container application/version, configuration and identity match the saved start, the Container is inactive, and both public routes return the fixed disabled response
- **THEN** protected recovery appends the observed disabled-deploy result and may release the lease without deploying or rolling back; any mismatch retains the lease without provider mutation
