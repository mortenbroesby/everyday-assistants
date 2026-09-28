## REMOVED Requirements

### Requirement: Per-owner rate limiting

**Reason**: The owner explicitly removes app-owned short-window throttling for
private household use. Daily/monthly cost controls remain independent.
**Migration**: Remove the four MCP/credential minute-rate environment variables
and minute-policy fields through a separately approved private configuration
transition before release; do not supply infinite limits or a compatibility gate.

## ADDED Requirements

### Requirement: Private requests have no application rate throttle

The application SHALL NOT reject otherwise eligible MCP operations or authenticated
credential validations based on a minute or other short-window request count.
External provider/platform limits SHALL remain external and SHALL NOT be bypassed.
Authentication, isolation, CSRF, credential verification, fixed backend capacity,
daily/monthly cost controls, deadlines and protected writes SHALL remain enforced.

#### Scenario: Eligible burst exceeds former MCP thresholds

- **WHEN** authenticated normal or expensive operations exceed the former minute
  thresholds while retained cost controls permit them
- **THEN** the app admits the operations without a rate-throttle rejection and
  counts each admitted operation atomically

#### Scenario: Valid credential submissions exceed former thresholds

- **WHEN** eligible users submit separately valid authenticated, CSRF-protected
  credential validations beyond the former minute thresholds
- **THEN** each validation proceeds without an app-owned rate-throttle gate,
  and invalid credentials still cannot replace a verified credential

#### Scenario: Retained cost control is exhausted

- **WHEN** an otherwise eligible request exceeds a retained cost ceiling
- **THEN** it is denied before backend work with a cost-limit reason, not a
  misleading short-window rate-limit reason

#### Scenario: Credential burst does not forget consumed authorization

- **WHEN** more than 32 credential actions occur before an earlier signed token
  expires, and a caller replays that consumed token
- **THEN** the earlier action remains rejected before provider work; consumed
  hashes are retained until expiry and storage failure does not permit the action

## MODIFIED Requirements

### Requirement: Configuration and environments fail safe

Operational thresholds SHALL be configurable through `MCP_ENABLED`,
`MCP_DAILY_LIMIT` and `MCP_EXPENSIVE_DAILY_LIMIT`; only credentials SHALL use
secret storage. The deployment SHALL provide local/development and production
environments. Non-production SHALL NOT access or mutate the real Nemlig basket
unless deliberately configured with production credentials. Obsolete request-rate
configuration SHALL NOT be redeployed or accepted as a private policy field.

#### Scenario: Non-production is configured normally

- **WHEN** a developer runs or deploys the non-production configuration
- **THEN** real Nemlig mutation credentials are absent and real basket mutation
  fails closed

#### Scenario: Required safety configuration is invalid

- **WHEN** a retained threshold or required environment binding is absent,
  malformed or unsafe
- **THEN** deployment validation or startup fails rather than silently choosing
  an unbounded default

### Requirement: Minimal privacy-safe observability

The service SHALL expose bounded structured evidence of enablement, breaker
state, admitted usage, cost-limit denials and unexpected Container wakes. It
SHALL NOT report app-owned short-window rate events or rate headroom after their
removal. It SHALL NOT log secrets, credentials, tokens, cookies, prompts, basket
contents or other sensitive Nemlig data.

#### Scenario: Operator inspects cost controls

- **WHEN** the operator follows the documented inspection procedure
- **THEN** enablement, breaker state, counts, cost-limit reasons and backend-wake
  evidence are available without sensitive data or obsolete rate headroom
