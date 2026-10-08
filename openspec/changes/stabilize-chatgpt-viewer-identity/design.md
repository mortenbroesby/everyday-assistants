## Context

See proposal.md for motivation and the delta specification for behavioral
requirements.

Baseline main `7c79bddc47801ddbc4b0bd1d7110a4a50ffaf7d8` records v16 deployment but a
fresh native card displaying the retired-resource notice. That observation does
not establish which URI was requested or whether a resource read occurred.

The existing viewer already uses server-owned snapshots, current-view tokens,
revision checks, bounded stale-state recovery, and protected submission.
Reuse those paths. The packaged artifact is self-contained and its validator
rejects external scripts/styles, dynamic imports, and application fetches.

Source context:

- `../../specs/nemlig-chatgpt-integration/spec.md`
- `../voice-first-product-review/design.md`
- `../voice-first-product-review/tasks.md`
- `../voice-first-product-review/specs/nemlig-chatgpt-integration/spec.md`

## Goals / Non-Goals

**Goals:**

- One permanent identity, explicit forward-only cutover, observable resource
  binding, and separate proof of current data and loaded code.
- Preserve all current server-side safety regardless of renderer age.

**Non-Goals:**

- Recovering old chats/cards, migrating draft state or approval, automatic
  reconnect, new OAuth registration, remote code loading, resource manifests,
  background polling, durable draft storage, or basket operations.

## Decisions

### One permanent identity

Use `ui://nemlig/draft-list.html`; it is absent from the inspected published
inventory. Do not reuse the already-retired unversioned product-viewer URI.
Keep both descriptor aliases equal and retain the existing MIME type and CSP.

At implementation, enumerate the published inventory at the integration base
and retire every prior identity, including any concurrently published identity.
Keep those registrations inert permanently; do not alias them to live controls.

The URI remains stable across releases. Release/package versions follow normal
policy but are not cache workarounds. If compatibility cannot be maintained,
stop for an explicit contract/cutover decision; do not silently rotate the URI.

### Current state does not imply current code

Reuse the existing current-state read and explicit activation paths. Rendering
starts from authenticated, conversation-scoped server state. Browser state and
retained results cannot grant authority or restore approval.

A server resource read returns current packaged bytes, but a cached host may
not read again. Compatible cached renderers must remain safe. Deployment,
resource-read success, and native loaded-build acceptance are distinct facts.

Keep the artifact self-contained. Do not add a remote manifest, script loader,
dynamic import, result-level template override, or speculative invalidation API.

### Minimal diagnostic evidence

Observe authenticated `resources/read` at the existing application boundary.
Emit at most one small event per handled read using a strict allowlist:

- `uri_class`: `current`, `retired`, or `other`
- `artifact_id`: SHA-256 of exact returned current HTML, otherwise null
- `correlation_id`: server-generated request-scoped diagnostic identifier

A fixed event name/schema identifier is permitted. Do not serialize raw URI
input, request bodies, response bodies, errors, headers, principal/session/chat
identifiers, or shopping data. Reuse an existing trustworthy diagnostic
correlation where available; otherwise generate a request-local identifier.
Never derive it from identity or shopping data.

Reuse existing diagnostic output and retention; add no telemetry service,
storage, polling, or provider requests. Diagnostics must not affect tool
authority or protocol correctness. Keep stdout clean for stdio MCP.

Provide a non-secret build marker in the packaged viewer for native inspection.
The acceptance record pairs that marker with the exact HTML digest. The marker
identifies a build; it is not an authorization token or independent proof of
every rendered byte.

Record missing host-read evidence honestly. A prefetch can precede the tool
call; a cached render can produce no read. Do not fabricate a
tool-to-resource correlation from timing alone.

### Preserve server safety

Do not change tool authority or submission semantics as a side effect of URI
retirement. A URI or build marker is not an authentication credential.

Keep principal/conversation ownership, current view and revision checks,
fresh product/basket validation, exact prepared authorization, single-use
application, additive writes, readback, and uncertain-write no-retry behavior.
Retain current cancellation and unavailable-state handling.

Old fetched resources are inert. Already-cached code cannot be remotely erased;
it is unsupported and remains subject to server checks. Do not promise that
reconnection revokes every old host session or destroys old server memory.

### Operator cutover

After separately accepted code delivery and deployment, the operator performs
the approved clean installation/reconnection for the intended MCP endpoint.
Do not automate disconnect, replacement, consent, credentials, or OAuth client
changes. Do not change the endpoint or provider architecture.

The supported entry point is a new chat. No old draft, view token, prepared
submission, or approval is imported. Existing temporary state may expire under
its existing lifecycle; the plan does not add a bulk deletion mechanism.

## Risks / Trade-offs

- Host retains old metadata or code → capture the boundary and leave delivery
  pending; do not automatically reconnect or churn URIs.
- A stable URI hides an incompatible code update → require compatibility
  evidence and native build acceptance; stable naming alone is not an update
  mechanism.
- Legacy code remains in old chats → those chats are unsupported, and current
  server checks remain mandatory.
- Diagnostics leak arbitrary input or increase logging → use strict fields, one
  bounded event per read, existing retention, and privacy/call-count tests.

## Migration Plan

1. Implement and verify identity, retirement, diagnostic evidence, and focused
   synthetic regressions.
2. Reconcile the competing URI policies in `voice-first-product-review` and
   connector recovery documentation without rewriting historical evidence.
3. Complete normal review, exact-head CI, release-note/version policy, and
   separately authorized deployment.
4. Operator performs clean cutover; capture installed binding and both native
   acceptance runs.
5. Sync/archive only after applicable evidence passes. Keep old native gaps
   marked superseded by this cutover, never retrospectively passed.

Rollback must preserve the permanent identity and retired-resource policy.
Use a compatible artifact under the permanent identity or text-only fallback;
do not restore a pre-cutover release that advertises old live viewers.
Any provider rollback remains an operator-controlled production action.

## Open Questions

None. The host's cache behavior remains an empirical acceptance result rather
than a design assumption.
