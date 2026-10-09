## Why

Repeated viewer URI changes have not established reliable ChatGPT binding:
main records a deployed v16 viewer while a fresh native card rendered an inert
retired document. The owner accepts losing access to old chats/cards and has
approved a forward-only clean connection cutover.

## What Changes

- Establish `ui://nemlig/shell.html` as the permanent supported viewer
  identity. Keep the standard descriptor binding and ChatGPT compatibility
  alias identical.
- **BREAKING:** Permanently retire `ui://nemlig/draft-list.html` and every
  previously published product-viewer identity. Preserve inert resource
  responses; do not migrate historical cards, draft choices, or approvals.
- Keep a small, stable MCP shell and load the current UI bundle on mount from a
  same-origin, content-addressed manifest with integrity checks. Never replace
  the code in an active shopping card.
- Distinguish current business state, stable-shell identity, and the executing
  UI bundle identity.
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

Touches viewer identity/resource registration, static-asset build and delivery
on the existing Worker, artifact identity, focused tests and synthetic browser
smoke, release documentation, connector recovery guidance, and affected
OpenSpec records.

Preserves authentication, principal/conversation isolation, current-view and
revision checks, exact prepared authorization, fresh validation, add-only
provider writes, verified readback, and uncertain-write no-retry behavior.
No new service, dependency, persistent state, background refresh, or provider
operation is planned.

Code delivery, production deployment, and operator connection cutover remain
separate stages. This plan does not execute external changes or authorize
credential changes or real basket operations.
