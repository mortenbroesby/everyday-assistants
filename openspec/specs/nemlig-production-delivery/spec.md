# nemlig-production-delivery Specification

## Purpose
Provide trusted CI-driven Nemlig production releases with durable recovery and accurately scoped authenticated acceptance, while preserving account isolation and existing cost and mutation boundaries.

## Requirements

### Requirement: CI releases execute only trusted exact source

Routine delivery SHALL accept only a full commit that remains an ancestor of the current default-branch head, the checked-out source, and a successful completed trusted default-branch push verification run for the same repository and workflow identity. A separately selected protected recovery mode MAY accept a previously green full commit that is an ancestor of current default-branch head, with the same exact checked-out source and CI provenance checks. Both modes SHALL revalidate after approvals and before mutation. Untrusted PR workflows, artifacts, dispatch content and stale source MUST NOT acquire production credentials or mutate production.

#### Scenario: PR verification shares a source revision
- **WHEN** a successful PR run exists for a candidate but no successful trusted default-branch push run exists
- **THEN** release preflight fails before provider mutation

#### Scenario: A trusted queued candidate remains eligible after main advances
- **WHEN** an approved candidate remains an ancestor of current remote main and no newer deployed descendant has superseded it
- **THEN** routine delivery deploys that exact candidate without automatically substituting a newer revision

#### Scenario: A newer deployed descendant supersedes a queued candidate
- **WHEN** a newer deployed revision is not an ancestor of the queued candidate
- **THEN** the queued operation fails before provider mutation

#### Scenario: Protected recovery selects a known-green ancestor
- **WHEN** an explicitly selected recovery candidate has a successful trusted default-branch push verification run and is an ancestor of current remote main
- **THEN** recovery may proceed through the protected environment and records recovery provenance separately from routine delivery

#### Scenario: Recovery selects unrelated history
- **WHEN** a recovery candidate is not an ancestor of current remote main or lacks exact-head trusted CI
- **THEN** recovery fails before deployment credentials or provider mutation are used

#### Scenario: Environment protection is missing
- **WHEN** the configured production environment, branch restriction, readiness or required approval is unavailable
- **THEN** the operation fails without exposing deployment secrets to candidate execution

### Requirement: Acceptance identities cannot access human account authority

An enabled synthetic acceptance identity SHALL use genuine signed authentication with exact issuer, audience, expiry, subject, authorized client and service scope checks. It SHALL remain disabled by default, use isolated immutable synthetic data, and preserve normal admission, quotas, breaker and timeouts. It MUST NOT inherit a human identity, owner privileges, real credentials, real provider access, or human account state. Ordinary principals MUST NOT select synthetic behavior through headers or arguments.

#### Scenario: Synthetic identity requests a forbidden operation
- **WHEN** a synthetic identity calls an administrative, credential, prepare, apply, automated-shopping, issue-creation, state-writing or unknown operation
- **THEN** both edge and backend enforce denial and no real provider or human-state access occurs

#### Scenario: Identity claims are incomplete or forged
- **WHEN** a token has the wrong issuer, audience, client, subject, expiry or scope, or a caller fabricates internal identity headers
- **THEN** it cannot select the synthetic identity and invalid authentication does not wake the Container

#### Scenario: Valid fixture acceptance succeeds
- **WHEN** the configured service identity runs its bounded allowed fixture sweep
- **THEN** real authentication, admission, transport and MCP paths execute against isolated fixtures without changing account data or increasing capacity

### Requirement: Acceptance evidence states what was actually exercised

The operation SHALL distinguish repository contracts, edge, authenticated synthetic service, live provider/user, owner-admin and real ChatGPT OAuth evidence. Required checks that fail, time out or are unavailable SHALL fail their release gate. Fixture, machine-token or alternate-client success MUST NOT be reported as user login, live provider or ChatGPT acceptance. All reports SHALL be bounded and exclude credentials, raw requests/responses, identities and private shopping data.

#### Scenario: A routine release follows the exact trusted source contract
- **WHEN** a reviewed release satisfies its exact-source, disabled, image, edge and synthetic service gates
- **THEN** routine CI promotion requires no owner access token and reports its service evidence distinctly from historical real-user evidence
- **AND** deployment eligibility does not depend on a historical cutover artifact

#### Scenario: Cutover or an authentication boundary changes
- **WHEN** the first CI cutover or a release changes authentication, credentials, principal isolation, provider integration or the client contract
- **THEN** the affected live-user/provider evidence and real ChatGPT evidence where applicable remain required before acceptance is complete

#### Scenario: A prior change still requires live acceptance
- **WHEN** synthetic CI acceptance passes but an existing change's real-user rollout task has not run
- **THEN** that task remains incomplete and the report does not claim it passed

#### Scenario: A feature lacks a safe fixture
- **WHEN** a feature cannot be exercised without creating or changing user data
- **THEN** it is reported unavailable and is never silently counted as exercised

#### Scenario: Owner credentials are offered to a CI release
- **WHEN** CI performs routine or initial-cutover delivery
- **THEN** it never requests, reads or stores owner credentials; required real-user cutover evidence is collected through the existing user client outside CI, and missing proof remains explicitly incomplete

### Requirement: Release ownership and recovery survive runner loss

Every release SHALL have unique operation ownership independent of source SHA and one shared cross-host production lease. Before and after each provider transition it SHALL persist a bounded redacted remote journal of intent and observed state. Concurrent, stale or changed ownership MUST NOT be stolen. A timeout, cancellation or lost response SHALL be treated as an uncertain mutation until provider readback reconciles it.

A protected CI run MAY automatically release its own terminal lease only after the deployment command has stopped, the final bounded evidence artifact has uploaded successfully, and the existing recovery predicate re-verifies the exact journal head plus Worker, configuration, Container image, application version, and instance state. This cleanup MUST NOT use age, TTL, force, or an unchecked workflow status as proof, and cutovers awaiting live acceptance MUST retain ownership.

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

#### Scenario: Another actor changes production
- **WHEN** provider state no longer matches the operation's known deployment during normal progress or rollback
- **THEN** the operation stops and reports drift without overwriting the other actor's version

### Requirement: Promotion preserves the effective deployment and cost boundaries

The release SHALL build/upload one candidate Container image, verify disabled rejection on both routes and an inactive sole Container, then enable the exact candidate source with the same image and unchanged safety bindings. It SHALL preserve the one EU lite Container limit, fixed storage topology, secrets, owner-managed configuration, quotas, breaker, bounded retries, sleep and kill switch. Recovery SHALL verify both Worker and Container compatibility rather than infer restoration from a command exit code.

#### Scenario: Enablement changes the image or safety state
- **WHEN** enablement reports a different image, unexpected effective configuration, secret binding loss or capacity increase
- **THEN** promotion fails and the operation attempts only ownership-safe bounded recovery

#### Scenario: The known candidate fails acceptance
- **WHEN** required acceptance fails and the candidate still owns production
- **THEN** the operation restores and verifies the recorded prior compatible state or retains a verified disabled or explicitly unknown state, and reports release failure

### Requirement: CI has bounded authority and cost

Production delivery SHALL use protected short-lived job credentials and the least supported deployment/service permission scopes. It SHALL have fixed time, request, token-issuance and journal bounds; no scheduled release, automatic mutation retry, new paid service or extra Container. CI MUST NOT invoke mutation acceptance or store owner passwords, browser cookies or owner refresh tokens. Provider and secret setup SHALL remain explicitly approved and recorded as complete only after readback.

#### Scenario: Credentials are missing or insufficient for required acceptance
- **WHEN** a release cannot establish valid required authentication within its bounded preflight
- **THEN** it stops before mutation without printing or persisting credential values

#### Scenario: A renewable delegated identity is proposed
- **WHEN** a future implementation uses rotating refresh credentials
- **THEN** it must provide serialized durable successor persistence and ambiguous-exchange recovery before activation, and cannot reuse a static stale CI secret

#### Scenario: A release reaches its deadline
- **WHEN** the bounded release or acceptance deadline expires
- **THEN** work is aborted where possible, uncertainty is recorded, and no automatic repeat or false completion occurs

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

### Requirement: Worker-version retention remains separate from image retention

The protected post-acceptance path SHALL treat Worker versions, deployment
records, and Container images as separate resources. It SHALL acquire the
shared production lease, use complete pagination with cardinality validation,
a fixed UTC 48-hour cutoff, active and journal-derived recovery protections,
fresh revalidation before each deletion, durable progress evidence, and
absence readback. Uncertain deletion SHALL retain the lease and stop without
blind retry; an explicit reviewed resume SHALL reconcile the pending version
before continuing.

#### Scenario: Worker history has an eligible old version

- **WHEN** a complete inventory proves a version is older than the cutoff and
  neither serving nor required for recovery
- **THEN** the version is an oldest-first deletion candidate and its absence is
  verified after deletion
