## Purpose

Defines the private single-household hosted runtime that keeps Nemlig Assistant
available without the owner's Mac while preserving its credential and mutation
safety boundaries.

## ADDED Requirements

### Requirement: Hosted-use feasibility gate

The system SHALL NOT create or activate hosted resources until the intended use,
region, provider terms, expected recurring cost, and Nemlig technical and policy
constraints have been reviewed and accepted for this single-household service.

#### Scenario: Feasibility is not accepted

- **WHEN** any required constraint remains unknown or incompatible
- **THEN** hosted deployment stops before credentials, identity configuration, or
  externally reachable service resources are created

### Requirement: One-owner access boundary

The hosted service SHALL authenticate through standards-based OAuth/OIDC, SHALL
authorize only the configured owner identity, and SHALL bind that identity to
exactly one configured Nemlig household account.

#### Scenario: Configured owner connects

- **WHEN** the configured owner presents a valid, unrevoked authorization issued
  for the hosted MCP service
- **THEN** the service permits the safe MCP tool surface for the one linked Nemlig
  account without accepting an account selector from tool input

#### Scenario: Another identity or supplied account selector is presented

- **WHEN** an unapproved identity connects or a tool input supplies an actor,
  subject, credential, household, or account selector
- **THEN** the service rejects the request before contacting Nemlig and exposes no
  information about the configured owner or account

### Requirement: Hosted secret boundary

The hosted service SHALL obtain Nemlig credentials and service secrets only from
approved managed secret storage and SHALL NOT return or place them in tool input,
tool output, logs, source control, deployment metadata, or client configuration.

#### Scenario: Nemlig authentication is required

- **WHEN** the hosted runtime must create or refresh its Nemlig session
- **THEN** it reads the configured secret through the server-side secret boundary
  and returns only sanitized success or remediation information

#### Scenario: Secret is unavailable or invalid

- **WHEN** the configured secret cannot be read or Nemlig rejects it
- **THEN** the request fails closed without retrying a mutation or disclosing the
  secret, authorization header, cookie, token, internal path, or raw response

### Requirement: Availability and operational health

The hosted service SHALL expose authenticated MCP service independently of the
owner's Mac and SHALL provide non-secret health, readiness, and deployed-revision
evidence suitable for automated checks and operator diagnosis.

#### Scenario: Local computer and tunnel are off

- **WHEN** the hosted release is healthy and the owner's Mac and Secure MCP Tunnel
  are unavailable
- **THEN** the owner can authenticate and use read-only Nemlig tools through the
  hosted endpoint

#### Scenario: A required dependency is unhealthy

- **WHEN** the runtime, identity validation, secret access, or required persistence
  cannot safely serve requests
- **THEN** readiness fails and MCP calls return sanitized unavailability without
  falling back to an unauthenticated or unknown release

### Requirement: Verified deployment and rollback

The hosted service SHALL deploy only an approved, fully verified commit, SHALL
record the deployed revision, SHALL require post-deployment health checks, and
SHALL keep the last healthy release recoverable when activation fails.

#### Scenario: Candidate deployment passes

- **WHEN** repository verification, deployment, and post-deployment health checks
  all succeed for one commit
- **THEN** that exact revision becomes the active hosted release and its evidence
  is available to the operator without exposing secrets

#### Scenario: Candidate deployment fails

- **WHEN** build, deployment, startup, migration, or health verification fails
- **THEN** the candidate does not replace the last healthy release and the
  operator receives a sanitized failure signal and rollback path

### Requirement: Privacy-safe operations

The hosted service SHALL emit health, deployment, authentication, proposal-state,
and sanitized upstream-failure events needed for operation and alerting, and
SHALL NOT log prompts, secrets, reusable session material, or complete basket or
plan contents.

#### Scenario: Security or availability event occurs

- **WHEN** authorization is rejected, readiness fails, a proposal becomes
  indeterminate, or deployment health regresses
- **THEN** the operator receives a bounded event containing event class, time,
  service revision, and non-secret correlation data only

### Requirement: Revocation and shutdown

The owner SHALL be able to revoke ChatGPT authorization, rotate the Nemlig
credential, disable the hosted service, and verify that new hosted calls can no
longer reach Nemlig.

#### Scenario: Authorization is revoked

- **WHEN** the owner's hosted-app authorization is revoked or expires without a
  valid refresh path
- **THEN** subsequent MCP calls are rejected before contacting Nemlig

#### Scenario: Hosted service is shut down

- **WHEN** the operator activates the documented shutdown procedure
- **THEN** hosted ingress stops, stored service secrets remain protected or are
  revoked as directed, and no basket mutation is attempted

### Requirement: Explicit dual-run cutover

The Secure MCP Tunnel SHALL remain the supported fallback during a bounded
hosted validation period and SHALL be retired only after the hosted acceptance
checks pass and the owner makes an explicit cutover decision.

#### Scenario: Hosted path is still under validation

- **WHEN** any acceptance check, rollback demonstration, revocation check, or
  owner alpha test remains incomplete
- **THEN** the tunnel is not deleted or revoked as part of the hosted change

#### Scenario: Cutover is approved

- **WHEN** the owner explicitly approves cutover after both paths have been
  compared and the hosted path passes every acceptance check
- **THEN** the ChatGPT app may switch to the hosted endpoint and the tunnel may be
  retired through its documented revocation procedure
