## Why

The deployed Nemlig shopping views work independently, but they do not show the user where they are in the agreed shopping journey or what to do next. The live ChatGPT acceptance test exposed this gap: a proposal rendered successfully, yet the approved List → Proposal → Choices → Approve flow was not visible.

## What Changes

- Add one consistent four-stage progress indicator—List, Proposal, Choices, Approve—to every custom shopping view.
- Mark completed, current, and upcoming stages without implying that an optional Choices stage is mandatory.
- Give every stage one explicit next-action instruction, including whether the user should continue conversationally or use the visible control.
- Treat a list composed in the surrounding ChatGPT conversation, or rendered independently by a compatible client, as the List stage; the product proposal begins only after that list is settled.
- Keep Proposal, Choices, and Approve independently renderable. A persistent single widget is not required as long as each view preserves enough journey context to guide the user forward.
- Preserve read-only proposal and choice behavior, exact final approval, fresh validation, cancellation, readback, and no-retry safeguards.

### Goal

A household user can enter any Nemlig shopping view and immediately understand the current stage, what has already happened, and the single safest next action.

### Non-goals

- Do not add a browser-side provider client or make the widget fetch Nemlig directly.
- Do not change product matching, authentication, basket mutation, release, hosting, React, Effect, or tool names.
- Do not require all stages to remain mounted in one persistent iframe.
- Do not add a new UI framework or dependency.

### Acceptance criteria

- Proposal, Choices, and Approve renders use the same four-stage visual language and accessible current-stage semantics.
- Proposal tells the user to name challenged products conversationally or continue when satisfied.
- Choices tells the user to select one replacement per challenged item and submit those choices.
- Approve states that nothing has been added yet and exposes `Add to Nemlig basket` as the only mutation boundary.
- When no replacement is needed, guidance makes clear that Choices can be skipped.
- A mobile-width showcase and a fresh read-only ChatGPT session demonstrate the progression without changing a basket.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Require independently rendered shopping views to communicate their shared List → Proposal → Choices → Approve journey and the next user action.

## Impact

- Primary implementation: `apps/nemlig-assistant/src/picker/PickerView.tsx` and its existing styles, contract tests, and showcase.
- The existing `review_proposed_basket` tool and `ui://nemlig/picker.html` resource remain the integration boundary.
- No new dependency, provider request, storage, retry, scaling, or operating-cost path is introduced.
- Epic boundary: branch `codex/guide-nemlig-shopping-flow`, one pull request, and the normal package-scoped version and deployment decision. No other OpenSpec change is included.
