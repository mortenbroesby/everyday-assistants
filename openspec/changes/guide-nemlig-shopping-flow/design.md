## Context

See `proposal.md` for motivation. The existing Apps SDK resource renders three `presentation` values—`proposal`, `choices`, and `recap`—from the same React component. ChatGPT may place each result in a separate conversation turn, so continuity cannot depend on a previous iframe remaining mounted. The current host/session bridge already handles choice submission and recap handoff; provider access stays server-side.

## Goals / Non-Goals

**Goals:**

- Make each independent render self-orienting within one four-stage shopping journey.
- Reuse the existing presentation value as the only source of current-stage state.
- Keep stage and next-action guidance accessible and legible at mobile width.

**Non-Goals:**

- A client-side router, persistent workflow state machine, or browser-side Nemlig fetch.
- A new MCP tool, resource, framework, dependency, or mutation path.
- Forcing the conversational List stage into the product-review payload.

## Decisions

### Render a shared static journey header in every view

Map the existing presentation to the current stage: `proposal` → Proposal, `choices` → Choices, and `recap` → Approve. List is already complete whenever the server can render a product proposal. This makes every iframe understandable without storing cross-turn browser state.

Alternative considered: one persistent multi-page widget. Rejected because ChatGPT controls result placement and lifecycle, while the user explicitly accepts independently rendered views.

### Treat Choices as an optional branch

Proposal guidance offers two paths: name challenged products conversationally, or continue directly to the final recap when satisfied. The stage label and copy must not imply that replacement selection is mandatory.

Alternative considered: always advance through an empty Choices screen. Rejected because it adds a meaningless step.

### Keep exactly one stage-specific next action

The proposal uses conversational guidance, Choices uses the existing `Use these choices` control, and Approve uses the existing `Add to Nemlig basket` control. Supporting safety text may remain, but it must not compete with the next action.

Alternative considered: adding Back, Continue, and Search buttons. Rejected because those controls have no existing server contract and would duplicate conversation.

### Use semantic HTML and existing styling primitives

Represent the journey as an ordered list with an accessible current-step marker and visually distinct completed/current/upcoming states. Extend existing CSS and Apps SDK UI components only.

## Risks / Trade-offs

- [ChatGPT does not expose an explicit no-changes transition from Proposal to Recap] → Stage copy tells the user what to ask conversationally; implementation tests the copy and host handoff separately.
- [A four-stage header may crowd narrow screens] → Use short labels, a responsive grid, and the existing mobile showcase gate.
- [A user may read Choices as required] → Mark it optional in Proposal and completed/skipped in Approve semantics and copy.

## Migration Plan

1. Add focused component/contract tests for stage mapping and next-action copy.
2. Add the journey header and minimal responsive styles to the existing picker.
3. Update the showcase to render Proposal, Choices, and Approve at mobile width.
4. Run focused checks and `pnpm verify` once on the final candidate.
5. After merge and normal release deployment, run a fresh read-only ChatGPT acceptance through the rendered proposal and choices flow; do not activate the basket mutation action.

Rollback is the single UI commit: the MCP payload and protected server workflow remain backward compatible.
