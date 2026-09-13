## Context

See `proposal.md` for motivation. The existing Apps SDK resource renders three `presentation` values—`proposal`, `choices`, and `recap`—from the same React component. The approved design adds a selectable List screen and establishes a precise shared visual system across all four stages. ChatGPT may place each result in a separate conversation turn, so continuity cannot depend on a previous iframe remaining mounted. The current host/session bridge already sends deliberate messages for choice submission and recap approval; provider access stays server-side.

## Goals / Non-Goals

**Goals:**

- Match the approved four-screen mobile design, not merely its information architecture.
- Make each independent render self-orienting within one four-stage shopping journey.
- Keep stage guidance and bottom Back/Next controls accessible and legible at mobile width.
- Preserve enough bounded, non-secret journey context for reliable backward navigation.

**Non-Goals:**

- A client-side router, persistent workflow state machine, or browser-side Nemlig fetch.
- A new resource, framework, dependency, client router, provider client, or mutation path.

## Decisions

### Treat the approved mockup as a visual contract

All four screens use the same four-column numbered stepper above a rounded white flow container. The current stage uses the pale-green highlight and green type. Headers pair title/subtitle with a soft-green count pill. Content uses pale neutral-green backgrounds, white rounded cards, subtle borders/shadows, generous mobile spacing, square pale image wells, dark product names, muted metadata, and solid green primary buttons. Back is visually secondary and shares the bottom action area with Next. Product evidence stays expandable without turning every card into a dense form.

Alternative considered: keep the current UI and add only a step label. Rejected by the live review because it does not resemble the approved design.

### Reuse one resource with a List-stage read tool

Add a bounded, read-only shopping-list review tool that attaches the existing UI resource and returns list labels, requested amounts, initial inclusion state, and a journey identifier or equivalent opaque non-secret navigation context. Extend the view payload as a discriminated union for List and the existing product-backed presentations. The List primary action sends only checked lines through the existing host conversation; it never contacts Nemlig from the browser.

Alternative considered: encode shopping-list rows as fake products in `review_proposed_basket`. Rejected because it weakens schemas and mixes pre-discovery intent with real product evidence.

### Render a shared journey header in every view

Map presentation to the current stage: `list` → List, `proposal` → Proposal, `choices` → Choices, and `recap` → Approve. This makes every iframe understandable even when earlier result cards are off-screen.

Alternative considered: one persistent multi-page widget. Rejected because ChatGPT controls result placement and lifecycle, while the user explicitly accepts independently rendered views.

### Treat Choices as an optional branch

Proposal guidance offers two paths: name challenged products conversationally, or continue directly to the final recap when satisfied. The stage label and copy must not imply that replacement selection is mandatory.

Alternative considered: always advance through an empty Choices screen. Rejected because it adds a meaningless step.

### Traverse carried snapshots inside the current widget

Use local component state to restore List, Proposal, Choices, and Approve whenever the current payload already carries the required bounded snapshot. Proposal exposes a per-product alternative action when candidates are present; that action opens a focused Choices view. Proposal Continue builds the recap locally, and Approve Back targets Choices only when that stage was visited. Keep the guarded `sendMessage` bridge for work that genuinely needs ChatGPT: initial discovery, final protected approval, and navigation fallback when an independently rendered card does not carry the required product snapshot.

Alternative considered: send every Back and Next action through ChatGPT. Rejected after live acceptance because each message creates another conversation turn/widget and can leave the originating controls looking inert.

### Keep one primary action and one secondary Back action

List has only `Search selected items with Nemlig`. Proposal has `Back to shopping list` and `Continue to final review`. Choices has `Back to proposal` and `Use these choices`. Approve has `Back` and `Add to Nemlig basket`. Supporting copy may explain conversational correction, but must not compete with these controls.

### Keep conversation authoritative for refinements

The widget is a current visual representation, not a closed form. At List, Proposal, Choices, and Approve, the user may add, remove, resize, constrain, or replace items through normal conversation. When supported by the host, publish the current bounded local selections through the Apps SDK model-context channel without starting another turn, so the next user message includes checkbox and replacement changes. ChatGPT applies only the requested delta, preserves unaffected state, and re-renders the complete affected stage. Any conversational change after a recap invalidates that recap; both server instructions and the approval handoff require a fresh recap before the protected write review.

### Use semantic HTML and existing styling primitives

Represent the journey as an ordered list with an accessible current-step marker and visually distinct completed/current/upcoming states. Extend existing CSS and Apps SDK UI components only.

## Risks / Trade-offs

- [Local navigation could diverge from server data] → Navigate only among validated snapshots already carried by the tool result; keep discovery and final approval on the guarded host bridge.
- [Back could reconstruct the wrong branch] → Carry the preceding visited stage explicitly and test Approve after both direct Proposal and Choices paths.
- [A four-stage header may crowd narrow screens] → Use short labels, a responsive grid, and the existing mobile showcase gate.
- [A user may read Choices as required] → Mark it optional in Proposal and completed/skipped in Approve semantics and copy.

## Migration Plan

1. Add focused component/contract tests for the List payload, visual structure, stage mapping, and navigation intents.
2. Add the read-only List tool, extend the existing shared picker, and wire guarded forward/back host messages.
3. Update the showcase to render all four approved screens and exercise both direct and replacement branches at mobile width.
4. Run focused checks and `pnpm verify` once on the final candidate.
5. After merge and normal release deployment, run a fresh read-only ChatGPT acceptance through List → Proposal → Choices → Approve, exercise Back at every applicable stage, and do not activate the basket mutation action.

Rollback is the single UI commit: the MCP payload and protected server workflow remain backward compatible.
