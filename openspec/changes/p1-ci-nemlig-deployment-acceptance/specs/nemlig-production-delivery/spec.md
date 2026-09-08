## Purpose

Provide trusted CI-driven Nemlig production releases with durable recovery and accurately scoped authenticated acceptance, while preserving account isolation and existing cost and mutation boundaries.

## ADDED Requirements

### Requirement: CI releases execute only trusted exact source

The delivery operation SHALL accept only an explicitly dispatched full commit matching the current default-branch head, the checked-out source, and a successful completed trusted default-branch push verification run for the same repository and workflow identity. It SHALL revalidate after approvals and before mutation. Untrusted PR workflows, artifacts, dispatch content and stale source MUST NOT acquire production credentials or mutate production.

#### Scenario: PR verification shares a source revision
- **WHEN** a successful PR run exists for a candidate but no successful trusted default-branch push run exists
- **THEN** release preflight fails before provider mutation

#### Scenario: Main advances during approval
- **WHEN** an approved candidate no longer equals current remote main
- **THEN** deployment fails without automatically substituting a newer revision

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

#### Scenario: A routine release follows an accepted cutover
- **WHEN** a reviewed behavior-preserving release satisfies its exact-source, disabled, image, edge and synthetic service gates
- **THEN** routine CI promotion requires no owner access token and reports its service evidence distinctly from historical real-user evidence

#### Scenario: Cutover or an authentication boundary changes
- **WHEN** the first CI cutover or a release changes authentication, credentials, principal isolation, provider integration or the client contract
- **THEN** the affected live-user/provider evidence and real ChatGPT evidence where applicable remain required before acceptance is complete

#### Scenario: A prior change still requires live acceptance
- **WHEN** synthetic CI acceptance passes but an existing change's real-user rollout task has not run
- **THEN** that task remains incomplete and the report does not claim it passed

#### Scenario: A feature lacks a safe fixture
- **WHEN** a feature cannot be exercised without creating or changing user data
- **THEN** it is reported unavailable and is never silently counted as exercised

### Requirement: Release ownership and recovery survive runner loss

Every release SHALL have unique operation ownership independent of source SHA and one shared cross-host production lease. Before and after each provider transition it SHALL persist a bounded redacted remote journal of intent and observed state. Concurrent, stale or changed ownership MUST NOT be stolen. A timeout, cancellation or lost response SHALL be treated as an uncertain mutation until provider readback reconciles it.

#### Scenario: Two invocations deploy the same SHA
- **WHEN** a second invocation encounters the first invocation's lease
- **THEN** it fails without replacing or cleaning up the first invocation's ownership

#### Scenario: The runner disappears after upload
- **WHEN** provider work may have been accepted but no result is recorded
- **THEN** the durable journal retains the intended transition and starting state, the lease remains, and a fresh invocation cannot repeat the mutation automatically

#### Scenario: Journal persistence fails
- **WHEN** transition intent cannot be durably recorded
- **THEN** the next provider mutation does not occur

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
