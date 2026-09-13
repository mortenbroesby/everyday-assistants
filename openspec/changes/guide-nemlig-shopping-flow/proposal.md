## Why

The deployed Nemlig shopping views work independently, but they do not show the user where they are in the agreed shopping journey or what to do next. The live ChatGPT acceptance test exposed this gap: a proposal rendered successfully, yet the approved List → Proposal → Choices → Approve flow was not visible.

## What Changes

- Implement the approved four-screen mobile design as the visual acceptance baseline: the four-column progress indicator, pale-green active step, rounded white flow container, compact product cards, restrained green accents, readable product imagery, and bottom action area SHALL match the supplied design rather than merely borrowing its labels.
- Add one consistent four-stage progress indicator—List, Proposal, Choices, Approve—to every custom shopping view.
- Mark completed, current, and upcoming stages without implying that an optional Choices stage is mandatory.
- Add a selectable List view for a shopping list already composed with ChatGPT; its primary action searches only checked lines.
- Give every stage a bottom navigation area with a primary Next action and, after List, a secondary Back action. Back restores the preceding visited stage, including skipping Choices when that branch was not visited.
- Keep List, Proposal, Choices, and Approve independently renderable, while allowing any product-backed widget to traverse the carried snapshots in place so Back and Next do not depend on another ChatGPT turn.
- Make the optional Choices stage explicitly reachable from Proposal whenever bounded alternatives are already available.
- Keep normal conversational editing active at every stage; spoken or typed additions, removals, quantity changes, preferences, and alternative requests re-render the affected complete view rather than forcing the user into UI-only editing.
- Preserve read-only proposal and choice behavior, exact final approval, fresh validation, cancellation, readback, and no-retry safeguards.

### Goal

A household user can enter any Nemlig shopping view and immediately understand the current stage, what has already happened, and the single safest next action.

### Non-goals

- Do not add a browser-side provider client or make the widget fetch Nemlig directly.
- Do not change product matching, authentication, basket mutation, release, hosting, React, Effect, or tool names.
- Do not require all stages to remain mounted in one persistent iframe or add a general-purpose client-side router.
- Do not add a new UI framework or dependency.

### Acceptance criteria

- List, Proposal, Choices, and Approve match the approved mobile design closely enough for side-by-side visual acceptance, including hierarchy, spacing, shapes, colors, imagery, and bottom controls.
- List lets the user check or uncheck requested lines and advances by searching only the checked lines.
- Proposal provides an explicit way to choose alternatives for a product, provides Back to List, and provides a primary Continue action when satisfied.
- Choices tells the user to select one replacement per challenged item, provides Back to Proposal, and submits through `Use these choices`.
- At every stage, the user can refine the list or selections conversationally and receive an updated complete view; changes after Approve require a fresh recap.
- Approve states that nothing has been added yet, returns to the actual preceding visited stage, and exposes `Add to Nemlig basket` as the only mutation boundary.
- When no replacement is needed, guidance makes clear that Choices can be skipped.
- A mobile-width showcase exercises all four screens plus forward/back navigation, and a fresh read-only ChatGPT session demonstrates in-widget progression without activating `Add to Nemlig basket`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Require the approved four-screen visual flow, independently renderable stages, selectable List input, and functional bidirectional navigation through List → Proposal → optional Choices → Approve.

## Impact

- Primary implementation: the existing picker React view, styles, host-session bridge, contracts, tests, and showcase.
- Add one read-only List-stage tool while reusing `ui://nemlig/picker.html`; keep `review_proposed_basket` for product-backed stages.
- No new dependency, provider request, storage, retry, scaling, or operating-cost path is introduced.
- Epic boundary: branch `codex/guide-nemlig-shopping-flow`, one pull request, and the normal package-scoped version and deployment decision. No other OpenSpec change is included.
