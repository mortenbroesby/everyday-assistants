# Unify local basket review

## Outcome

Replace separate To decide and Ready tabs with one accessible local basket list. Rows support swipe actions for local removal and alternative search, while each action still requires a fresh explicit button activation. Alternative search uses a dedicated full-page view and replacement remains a local review edit.

Every local basket item is Ready and is included in the single Submit to Nemlig action. Unavailable or incomplete lines stop preparation and require resolution; no line may be silently omitted. Provider writes continue through the existing exact authorization, fresh validation, single-use apply, and verified readback flow.

## Scope

- Nemlig Assistant picker, local review state transitions, review action descriptions, and feature documentation.
- Existing review service and tool behavior only where needed to keep all current items submission candidates and allow a Ready row to search alternatives and replace it without changing its Ready status or quantity.
- Pin `react-swipeable` in the Nemlig Assistant package for gesture recognition; keep disclosure, focus, and action activation in the app.

## Non-goals

- Any change to actual Nemlig basket semantics, provider APIs, proposal protocol, authorization rules, or checkout behavior.
- Automatic gesture-triggered navigation or mutation, remote list persistence, unrelated redesign, or dependency additions beyond the swipe library.

## Acceptance

- The review shows one list labeled “Local basket”; no To decide/Ready tabs or row-selection checkboxes.
- A left or right swipe past half the row reveals the corresponding red Remove or green Find alternative action. Releasing the gesture only reveals the action. A subsequent tap on its real button performs the local remove or opens alternatives.
- Keyboard and assistive-technology users can use equivalent ordinary controls in the expanded row.
- Alternatives appear in a dedicated full-page view with Back, current product, search, option selection, and explicit “Use selected alternative”. Back leaves the local row unchanged. A Ready row can search and replacement preserves its Ready status and quantity while invalidating a prepared submission.
- Every item remains Ready; additions and replacements are immediately submission candidates. Submit prepares every current item as one exact recap. Any unavailable or incomplete line prevents preparation and remains visible for resolution. Exact confirmation, owner isolation, concurrency and uncertain-write gates, provider preflight, single-use write, and readback remain intact.

## Verification

Run focused service tests, the synthetic MCP and packaged-viewer browser smokes, typecheck, build, and the repository verification gates. Do not access a real basket or provider.
