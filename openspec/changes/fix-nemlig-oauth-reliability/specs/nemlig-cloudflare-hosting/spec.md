## MODIFIED Requirements

### Requirement: Execution and retry work is bounded

The Worker SHALL enforce one explicit total deadline for every hosted MCP request and SHALL enforce shorter explicit deadlines for authentication, Durable Object or Container dispatch, internal storage, and Nemlig upstream work. Every external request SHALL support cancellation and a bounded retry count, with no unbounded loop, recursive retry, replacement job, or process that can indefinitely regenerate work. Read-only retries SHALL fit inside the total request deadline, and mutation attempts SHALL NOT be retried automatically.

#### Scenario: Hosted request exceeds its total deadline

- **WHEN** authentication, backend startup, dispatch, storage, upstream work, or response handling does not finish within the configured total request timeout
- **THEN** the gateway cancels remaining work where supported and returns a stable sanitized timeout response with a correlation reference before the client can wait indefinitely

#### Scenario: Nested boundary exceeds its deadline

- **WHEN** Auth0 metadata or JWKS access, Durable Object or Container dispatch, internal storage, or a Nemlig upstream request exceeds its shorter boundary timeout
- **THEN** that boundary fails with a distinct non-secret timeout category, performs no unbounded retry, and remains inside the total hosted request deadline

#### Scenario: Retriable read failure persists

- **WHEN** every permitted read-only retry fails or the remaining total deadline cannot accommodate another attempt
- **THEN** the operation returns a sanitized failure without another attempt, replacement job, or recursive request

#### Scenario: Nemlig or backend call times out

- **WHEN** a downstream operation exceeds its configured timeout
- **THEN** the request fails with sanitized error information after bounded work and is not retried indefinitely

#### Scenario: Retriable downstream failure persists

- **WHEN** every permitted retry fails
- **THEN** the gateway returns failure after the configured maximum attempt count and creates no replacement job or recursive request

#### Scenario: Mutation result is slow or uncertain

- **WHEN** a basket mutation request times out, is cancelled, or has an indeterminate result
- **THEN** the operation is not retried and returns inspection guidance consistent with the existing proposal and readback safety contract

### Requirement: Minimal privacy-safe observability

The service SHALL emit bounded structured operational evidence that identifies deployment revision, route class, method, correlation reference, operation class when known, terminal outcome, response status class, and elapsed time. It SHALL distinguish disabled, configuration-rejected, origin-rejected, authentication-rejected, admitted, rate-limited, breaker-rejected, backend-dispatched, timed-out, failed, and completed outcomes plus Container lifecycle and breaker transitions. It SHALL NOT log authentication secrets, credentials, bearer tokens, cookies, OAuth authorization codes or state, prompts, shopping-list or proposal payloads, basket contents, raw provider responses, internal session identifiers, or other sensitive Nemlig data.

#### Scenario: Hosted request completes or fails

- **WHEN** a request reaches the Worker
- **THEN** the operator can identify its terminal boundary outcome, deployment revision, elapsed time, and correlation reference without inspecting private request or response content

#### Scenario: Reconnect produces no Worker request

- **WHEN** the operator reproduces an OAuth reconnect attempt and no corresponding Worker event exists during the bounded observation window
- **THEN** the runbook classifies the failure as occurring before the Worker boundary and directs inspection to ChatGPT and Auth0 evidence rather than the Container or Nemlig

#### Scenario: Sensitive material reaches an error boundary

- **WHEN** authentication, MCP handling, storage, or an upstream provider throws an error containing request or provider data
- **THEN** logs and responses retain only an allowlisted error category and never serialize the raw error, stack, token, header, body, URL query, or private data

#### Scenario: Logging volume is attacked or unusually high

- **WHEN** unauthenticated, malformed, or repetitive traffic exceeds the normal single-household pattern
- **THEN** success and rejection evidence is sampled or rate-bounded while timeout, breaker, deployment, and Container lifecycle signals remain available without unbounded log amplification

#### Scenario: Operator inspects cost controls

- **WHEN** the operator follows the documented inspection procedure
- **THEN** current enablement, breaker state, counts, trip reason and time, rate limiting, backend wake evidence, and bounded request outcomes are available without sensitive data

## ADDED Requirements

### Requirement: Bounded read-only hosted canary

The production deployment SHALL provide a repeatable canary that checks the public health and revision endpoints, OAuth protected-resource metadata, cheap unauthorized rejection, and authenticated read-only MCP acceptance under explicit per-step and total deadlines. It SHALL make no basket, favorites, shopping-list, feature-request, or other external-state mutation.

#### Scenario: Cloud-only path is healthy

- **WHEN** the operator runs the canary with valid owner authorization
- **THEN** every boundary completes inside its documented budget, reports deployment revision and latency evidence, and proves authenticated read-only MCP behavior without the legacy Mac tunnel services

#### Scenario: Canary step hangs or fails

- **WHEN** any edge, OAuth metadata, authentication, MCP, Container, storage, or upstream step exceeds its deadline or returns an unexpected result
- **THEN** the canary exits unsuccessfully, names the last completed boundary and correlation reference when available, and performs no mutation or automatic retry of uncertain work
