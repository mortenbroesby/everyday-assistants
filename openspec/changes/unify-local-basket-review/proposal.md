# Unify local basket review

## Outcome

Replace separate To decide and Ready tabs with one accessible local basket list. Holding a row opens a modal action sheet for local removal, alternative search, details, and quantity. Tapping a row opens full-screen details. Alternative search uses a dedicated full-page view and replacement remains a local review edit.

Every local basket item is Ready and is included in the single Submit to Nemlig action. Unavailable or incomplete lines stop preparation and require resolution; no line may be silently omitted. Provider writes continue through the existing exact authorization, fresh validation, single-use apply, and verified readback flow.

## Scope

- Nemlig Assistant picker, local review state transitions, review action descriptions, and feature documentation.
- Existing review service and tool behavior only where needed to keep all current items submission candidates and allow a Ready row to search alternatives and replace it without changing its Ready status or quantity.
- Use Radix Dialog for the action sheet and details modal, and TanStack React Virtual for long Local baskets; keep long-press recognition and action activation in the app.
- Bound the viewer height and let its single native scroll region contain long content. Virtualize larger Local baskets.

## Non-goals

- Any change to actual Nemlig basket semantics, provider APIs, proposal protocol, authorization rules, or checkout behavior.
- Automatic long-press mutation, remote list persistence, unrelated redesign, or other dependency additions.

## Acceptance

- The review shows one list labeled “Local basket”; no To decide/Ready tabs or row-selection checkboxes.
- A stationary two-second hold opens a modal sheet with four rows: Remove product, Find alternative, Show details, and full-width quantity controls. Releasing or moving early cancels the hold. Opening the sheet changes no basket state.
- Tapping a row opens a near-full-screen details modal that closes by ×, Escape, or outside activation. The viewer does not intercept horizontal swipes.
- Long Local baskets stay within the bounded viewer, remain reachable through one scroll region, and preserve keyboard focus as virtual rows change.
- Keyboard users can focus a row and press Shift+F10 to open the same sheet; Enter or Space opens details.
- Alternatives appear in a dedicated full-page view with Back, current product, search, option selection, and explicit “Use selected alternative”. Back leaves the local row unchanged. A Ready row can search and replacement preserves its Ready status and quantity while invalidating a prepared submission.
- Every item remains Ready; additions and replacements are immediately submission candidates. Submit prepares every current item as one exact recap. Any unavailable or incomplete line prevents preparation and remains visible for resolution. Exact confirmation, owner isolation, concurrency and uncertain-write gates, provider preflight, single-use write, and readback remain intact.

## Verification

Run focused service tests, the synthetic MCP and packaged-viewer browser smokes, typecheck, build, and the repository verification gates. Do not access a real basket or provider.
The bounded inline scroller departs from OpenAI's usual no-nested-scrolling card guidance; check real ChatGPT mobile scrolling after release.
