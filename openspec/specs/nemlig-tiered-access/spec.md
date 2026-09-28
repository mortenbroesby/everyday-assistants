# Nemlig Private Family Access Specification

## Purpose

Defines explicitly configured private family access with independent encrypted
credentials, isolated accounts and user state, and no usage tiers or quotas.

## Requirements

### Requirement: Private fail-closed principal policy

The service SHALL authorize only explicitly configured enabled family identities
in one current strict private policy with opaque principal keys and an explicit
owner subject. It SHALL NOT accept old policy versions, tiers, budgets, inline
credentials or dynamic unknown-identity fallback. Every member SHALL use their
own current encrypted credential record. The owner SHALL be one enabled member,
not implicitly the first array entry. No private values SHALL be committed.

#### Scenario: Unknown principal authenticates

- **WHEN** a valid identity is absent from the family policy
- **THEN** it is rejected before backend wake or provider access

#### Scenario: Invitees are not configured

- **WHEN** the private configuration names only the owner
- **THEN** only that identity is eligible; no guest class or implicit enrollment exists

#### Scenario: Policy is invalid

- **WHEN** policy is old, absent, malformed, duplicated, or lacks one enabled exact owner
- **THEN** configuration fails closed without another member's identity or credentials

#### Scenario: Configured member has no invitation registry record

- **WHEN** the exact owner manages a configured family member without an old
  invitation registry record
- **THEN** the member is present in owner controls and disable/revoke persists
  using only that member's configured subject/key; unknown targets cannot update

#### Scenario: Disable occurs during credential validation

- **WHEN** owner disable or revoke commits while credential validation is pending
- **THEN** the later credential commit fails without restoring access or credentials

#### Scenario: Credential-free profile discovery during active shopping

- **WHEN** an authorized profile request lacks a provider credential envelope
- **THEN** profile discovery does not discard the credential-bound current review
  or submission state; genuine credential rotation still invalidates stale state

### Requirement: Per-principal isolation

The system SHALL bind each admitted request and MCP session to one authenticated
principal and SHALL use only that principal's Nemlig credentials, upstream
session, basket, favourites, proposals, approvals, shopping plans, and named
lists. A principal identifier SHALL be opaque outside the encrypted policy and
SHALL NOT be accepted from an untrusted request field.

#### Scenario: Principal opens an MCP session

- **WHEN** an enabled principal initializes an MCP session
- **THEN** the session, client, proposal service, and storage scope are created
  for that authenticated principal only

#### Scenario: Session is reused by another principal

- **WHEN** a different authenticated principal presents an existing MCP session
  identifier or proposal reference
- **THEN** the request is denied without revealing whether the referenced state
  exists and without any Nemlig mutation

#### Scenario: Principal configuration is unavailable

- **WHEN** an admitted identity has no usable independent Nemlig credentials or
  its own session cannot be established
- **THEN** the operation fails without falling back to family or another
  principal's credentials, session, basket, favourites, proposals, or lists

### Requirement: Global safeguards override all tiers

All configured family members SHALL remain
subject to the manual kill switch, fixed Container capacity, authentication,
deadlines, bounded work/retries and exact protected provider-write approval.
The service SHALL NOT retain tiers, category caps, reserve allocations or forecasts.
Owner-only administrative permission SHALL be checked against the configured
owner identity rather than a usage tier.

#### Scenario: Global breaker or kill switch is active

- **WHEN** a member requests work while the manual kill switch denies it
- **THEN** no membership label or owner privilege bypasses admission

#### Scenario: Tier totals are misconfigured

- **WHEN** configuration contains removed tiers or budget fields
- **THEN** strict validation rejects it without a compatibility conversion

#### Scenario: Non-owner attempts administrative access

- **WHEN** another authenticated family member requests owner-only operations
- **THEN** authorization rejects them without disclosing identities or shopping data

### Requirement: Invitee activation requires isolated acceptance

No additional family identity SHALL be enabled without exact configured identity,
independent encrypted credentials and acceptance of isolation and denial-before-
wake. Tier ordering is not an acceptance gate because tiers do not exist.

#### Scenario: New invitee is prepared

- **WHEN** the owner prepares another disabled family identity
- **THEN** it remains unable to shop until isolated acceptance and explicit enablement

#### Scenario: Acceptance cannot prove isolation

- **WHEN** identity/account/session/approval isolation is missing or uncertain
- **THEN** that identity remains disabled and prior configured access is preserved
