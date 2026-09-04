## Why

Nemlig Assistant repeatedly became unusable in ChatGPT without a bounded error or enough evidence to identify the failing boundary. The current incident most strongly implicates an expired ChatGPT OAuth connection or reconnect handoff—not the healthy Worker or Nemlig backend—so the hosted path needs explicit OAuth-boundary evidence, end-to-end deadlines, and a repeatable connection acceptance check now.

## What Changes

- Add privacy-safe structured lifecycle logging and a correlation identifier at the Cloudflare gateway so operators can distinguish disabled, unauthenticated, rejected, admitted, backend-dispatched, timed-out, and completed requests.
- Add explicit cancellation and separate bounded timeout budgets for Auth0 metadata/JWKS access, Durable Object and Container dispatch, Nemlig upstream calls, and the complete hosted MCP request.
- Return stable sanitized timeout responses before ChatGPT can appear to wait indefinitely, without retrying mutations or amplifying work.
- Extend the read-only production canary and runbook to prove the anonymous edge, OAuth metadata, authenticated MCP tools, deployment identity, and latency budget while identifying when no request reached the Worker.
- Add a clean ChatGPT reconnect acceptance procedure for the single existing `Nemlig Assistant` app, including dynamic-client/callback evidence from Auth0 without recording credentials, tokens, codes, or OAuth state.
- Keep logging volume and retention bounded and preserve the existing kill switch, circuit breaker, quotas, one-Container limit, owner boundary, and basket approval contract.

Non-goals: implementing OAuth inside the Worker, creating another ChatGPT app, changing Auth0 credentials or owner identity, weakening authentication, adding a paid observability service, enabling autoscaling, or changing the Nemlig basket.

Acceptance requires two fresh ChatGPT read-only runs after reconnect, deterministic timeout tests at every hosted boundary, redaction tests, a passing read-only production canary, and evidence that the cloud-only path works with the legacy Mac tunnel services inactive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Strengthen bounded execution and minimal observability requirements with correlation, deployment identity, boundary outcomes, explicit layered timeout budgets, sanitized timeout classes, and a bounded read-only canary.
- `nemlig-chatgpt-integration`: Require a repeatable fresh OAuth reconnect acceptance path for the one existing app and evidence that distinguishes a ChatGPT/Auth0 handoff failure from a Worker/backend failure.

## Impact

Affected areas include the Cloudflare gateway and Container dispatch, Auth0 metadata and JWKS fetching, Nemlig HTTP client boundaries, Worker configuration validation, production probes and runbooks, and their tests. Production rollout remains an explicit disabled-first operation. No new dependency or external service is expected; Cloudflare log volume must remain within the existing single-household quotas and a documented bounded cost envelope.
