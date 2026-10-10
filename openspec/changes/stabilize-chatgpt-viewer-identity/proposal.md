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
  fixed-origin, content-addressed manifest with integrity checks. Never replace
  the code in an active shopping card.
- Distinguish current business state, stable-shell identity, and the executing
  UI bundle identity.
- Add bounded, privacy-safe `resources/read` evidence containing only URI class,
  current artifact identity when served, and request-scoped correlation.
- Define clean connection installation/reconnection as an operator-initiated
  external step. Require native proof after cutover; do not promise automatic
  host refresh or tool-result rebinding.
- **BREAKING:** Replace card-scoped Draft list authority with one temporary,
  authenticated conversation-owned Draft list. Supported cards are
  interchangeable clients of that list; they do not require a view token,
  review identifier, revision, or activation step to perform local actions.
- Retain an exact prepared `submission_id` as the only UI-supplied identifier
  for a real-basket submission. It continues to bind the reviewed product
  payload and is not Draft list ownership or card authority.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Permanent viewer identity, forward-only
  historical-card retirement, binding evidence, and native cutover acceptance.
- `nemlig-product-review`: One temporary conversation-owned Draft list for
  supported cards, without card-scoped local authority.
- `nemlig-mcp`: Widget actions with only their necessary input: `{action}` for
  temporary Draft list changes and `{submission_id}` for protected submission.
- `nemlig-guided-shopping`: Current-Draft-list recovery wording for an
  unavailable temporary list.
- `nemlig-package-distribution`: Packaged skill guidance that no longer asks
  callers to retain card or review identifiers.

## Impact

Touches viewer identity/resource registration, static-asset build and delivery
on the existing Worker, artifact identity, focused tests and synthetic browser
smoke, release documentation, connector recovery guidance, and affected
OpenSpec records.

Preserves authentication, principal/conversation isolation, exact prepared
authorization, fresh validation, add-only provider writes, verified readback,
and uncertain-write no-retry behavior. Removes current-view and revision
checks only for temporary local Draft list interactions. No new service,
dependency, persistent state, background refresh, or provider operation is
planned.

Code delivery, production deployment, and operator connection cutover remain
separate stages. This plan does not execute external changes or authorize
credential changes or real basket operations.
