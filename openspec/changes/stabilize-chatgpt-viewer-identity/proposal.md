## Why

Repeated viewer URI changes have not established reliable ChatGPT binding:
main records a deployed v16 viewer while a fresh native card rendered an inert
retired document. The owner accepts losing access to old chats/cards and has
approved a forward-only clean connection cutover.

## What Changes

- Establish `ui://nemlig/draft-list.html` as the permanent supported viewer
  identity. Keep the standard descriptor binding and ChatGPT compatibility
  alias identical.
- **BREAKING:** Permanently retire every previously published viewer identity,
  including the unversioned URI and v1–v16. Preserve inert resource responses;
  do not migrate historical cards, draft choices, or approvals.
- Keep the self-contained renderer and server-authoritative Draft list.
  Distinguish current business state from the renderer build actually loaded.
- Add bounded, privacy-safe `resources/read` evidence containing only URI class,
  current artifact identity when served, and request-scoped correlation.
- Define clean connection installation/reconnection as an operator-initiated
  external step. Require native proof after cutover; do not promise automatic
  host refresh or tool-result rebinding.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Permanent viewer identity, forward-only
  historical-card retirement, binding evidence, and native cutover acceptance.

## Impact

Touches viewer identity/resource registration, artifact identity, the existing
HTTP/MCP diagnostic boundary, focused tests and synthetic browser smoke,
release documentation, connector recovery guidance, and affected OpenSpec
records.

Preserves authentication, principal/conversation isolation, current-view and
revision checks, exact prepared authorization, fresh validation, add-only
provider writes, verified readback, and uncertain-write no-retry behavior.
No new loader, manifest service, dependency, persistent state, background
refresh, or provider operation is planned.

Code delivery, production deployment, and operator connection cutover remain
separate stages. This plan does not execute external changes or authorize
credential changes or real basket operations.
