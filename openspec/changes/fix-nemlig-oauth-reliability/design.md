## Context

See `proposal.md` for motivation. The production Worker currently has 5-second Auth0 and 35-second backend timeouts, while the Container-side Nemlig client can make four 30-second read attempts. The gateway emits isolated event names but no per-request correlation, terminal summary, elapsed time, or deployment identity. The current incident shows a healthy Worker, Auth0 discovery endpoint, OAuth resource metadata endpoint, and authenticated read-only tools; only ChatGPT's expired OAuth reconnect remains unproven. The Worker cannot observe the ChatGPT-to-Auth0 authorization and token exchange, so diagnosis needs separate ChatGPT, Auth0, and Worker evidence planes.

The worktree also contains an uncommitted named-list storage repair from the interrupted rollout. That repair will be verified and committed separately before reliability code so incident changes remain reviewable.

## Goals / Non-Goals

**Goals:**

- Make every request that reaches the Worker produce a privacy-safe terminal boundary outcome with one server-generated correlation reference.
- Ensure the caller receives a sanitized response within a 90-second total budget even if authentication, Durable Object RPC, Container startup, internal storage, or Nemlig stalls.
- Reduce read-only Nemlig retry duration to fit inside the hosted budget while preserving zero automatic mutation retries.
- Make a reconnect attempt diagnosable across ChatGPT, Auth0 tenant events, and Worker events without copying credentials or OAuth artifacts.
- Keep observability volume proportional and low under both household use and unauthenticated Internet noise.

**Non-Goals:**

- Proxying or reimplementing Auth0 authorization or token endpoints in the Worker.
- Logging request bodies, MCP arguments, provider responses, tokens, codes, OAuth state, user identity, shopping data, or stack traces.
- Installing a log drain, analytics vendor, queue, tracing service, or always-awake component.
- Changing Auth0 clients, callbacks, secrets, the owner subject, or production resources during implementation.
- Retrying, testing, or otherwise changing the real Nemlig basket.

## Decisions

### 1. Treat OAuth reconnect as a three-plane diagnosis

The runbook will record only timestamps, non-secret Auth0 event categories, the existing ChatGPT app identity and URL, and Worker correlation evidence. If ChatGPT launches Auth0 but Auth0 records no successful authorization/token event, the failure stays in the ChatGPT/Auth0 plane. If Auth0 succeeds but no Worker request follows, it stays before the resource server. Only a Worker request can implicate gateway or backend code.

This is preferred over adding OAuth endpoints to the Worker because Auth0 already owns authorization and token issuance, and proxying them would expand the secret and attack surface. It is also preferred over uninstalling and recreating the app because that destroys the best incident evidence and risks duplicates.

### 2. Emit one allowlisted terminal request event

The gateway will generate a UUID for each incoming request and return it in `x-nemlig-request-id`. A request-scoped recorder will emit one terminal JSON event containing only schema version, event name, request ID, revision, route class, method, operation class when known, outcome, HTTP status, and elapsed milliseconds. Sparse separate events remain for Container lifecycle and breaker transitions.

Raw errors and arbitrary fields will never be serialized. Outcome and route values are closed unions. Existing scattered request events will be consolidated so a normal call does not produce several duplicate log lines.

For cost control, every authenticated admitted useful operation produces at most one terminal request event and is already capped by the 5,000-operation daily breaker. Public protocol successes and ordinary authentication rejections are deterministically sampled at 1%; configuration failures, timeouts, backend failures, breaker transitions, and Container lifecycle events are always retained. No new paid service or log drain is introduced. This caps normal useful-request evidence at roughly 5,000 events per day plus sparse control events, while hostile public traffic is reduced by a factor of 100 rather than logged in full.

### 3. Enforce one absolute request deadline plus shorter boundary budgets

Add fail-closed configuration for a 90,000 ms total MCP request timeout, 5,000 ms authentication timeout, 3,000 ms control-plane timeout for admission and internal storage, and a backend timeout no greater than 85,000 ms or the remaining total budget. Each timeout uses an abort signal when supported and a response-bounding race for RPC surfaces that do not accept a signal. The gateway checks remaining time before starting another boundary.

The Container-side Nemlig client will allow up to 60,000 ms for one read-only network interaction and at most one retry after an early transport failure. A timed-out first attempt is not retried. Mutations remain single-attempt. The 90-second outer deadline prevents a several-minute hang while allowing normal slow catalogue work to return.

The total deadline response is HTTP 504 with `{ "error": "request_timeout", "request_id": "..." }`. Boundary failures retain narrower allowlisted categories such as `authentication_timeout`, `control_timeout`, `backend_timeout`, `storage_timeout`, or `upstream_timeout` where the caller can safely receive them. The request ID is diagnostic but carries no identity or session meaning.

### 4. Compose cancellation instead of overwriting caller aborts

Every fetch boundary will combine the caller signal with its own timeout signal. The gateway will pass the absolute deadline to internal code through an in-memory request context and a non-secret internal header only where the Container must compute remaining time. No client-supplied correlation ID or deadline is trusted.

This is preferred over independent fixed timeouts because sequential boundaries could otherwise exceed the caller-visible total. It is preferred over a queue or background retry because delayed work would violate mutation safety and cost bounds.

### 5. Extend the existing acceptance runner instead of adding infrastructure

The edge probe will give each fetch a short timeout, verify `/healthz`, `/revision`, protected-resource metadata, and cheap rejection behavior, and print the last completed boundary. Authenticated read-only acceptance will impose a total deadline on connection and tool calls, exercise shopping-list and bounded favorites reads, and report non-secret latency and correlation references when available. It will never call a state-writing tool.

The ChatGPT acceptance remains a documented manual step because credentials must be entered by the owner and ChatGPT controls the OAuth UI. It uses the one existing app, refreshes metadata separately from reconnecting OAuth, and requires two fresh read-only conversations.

## Risks / Trade-offs

- [A 90-second deadline makes a genuinely stalled call slower to fail] → Retain the last known-good version, terminal observability, and dynamic kill switch; never remove the total deadline.
- [One-percent public sampling can miss an individual rejected request] → Always retain failures during an explicitly bounded diagnostic window only if the operator deliberately enables it; use Auth0 and ChatGPT timestamps to determine whether the Worker was reached.
- [A response-bounding race cannot forcibly stop every Durable Object RPC] → Pass abort signals and remaining deadlines wherever supported, avoid starting work without enough budget, and keep quotas and the fixed one-Container limit as secondary bounds.
- [Auth0 reconnect can fail entirely outside repository code] → The runbook must say so plainly and collect Auth0 tenant evidence; repository changes are successful only if they make that boundary provable, not if they relabel it as a Worker fault.
- [Structured logs can leak data through careless future fields] → Use a closed typed schema and explicit field construction with tests that reject sensitive key names and representative secret values.
- [Reduced read retries may lower tolerance for transient Nemlig errors] → Allow one retry only for reads, expose a quick sanitized failure, and rely on a new user request rather than hidden multi-minute retry loops.

## Migration Plan

1. Verify and commit the existing named-list storage repair separately.
2. Implement request context, timeout composition, closed event schemas, client retry bounds, canary changes, and tests locally.
3. Run focused tests, `pnpm verify`, privacy checks, and strict OpenSpec validation.
4. Commit and push the reliability change; verify the remote ref and exact-head CI.
5. Deploy the exact version with `MCP_ENABLED=false`; verify both public routes fail closed and the Container remains inactive.
6. Enable that same version, run edge and authenticated read-only acceptance, and inspect redacted correlation evidence.
7. Refresh the one existing ChatGPT app, reconnect Auth0 manually, and complete two fresh read-only conversations.
8. Roll back to the recorded enabled version or disable MCP immediately if any safety, latency, privacy, or compatibility check fails.

Production deployment, Auth0 configuration changes, and any Nemlig mutation remain separately authorized operations.
