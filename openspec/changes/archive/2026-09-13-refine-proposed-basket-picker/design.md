## Context

`review_proposed_basket` already resolves every supplied item, carries favourite and confidence metadata, and serves one bundled React resource. `PickerView` already renders product evidence and alternatives, while the Apps SDK host boundary supports conversational `sendMessage` but not direct tool invocation. The protected write path already owns exact review, approval, fresh validation, single use, cancellation, apply, readback, and indeterminate-write handling.

## Goals / Non-Goals

**Goals:**

- Make the complete proposal scannable at narrow and wide widths.
- Use conversation for broad correction and UI controls only for exact replacement choices.
- Keep unchallenged selections stable, then show a complete final recap.
- Preserve the existing accessible product evidence and protected write lifecycle.

**Non-Goals:**

- Do not add browser-side search, provider access, basket access, editable quantities, a client-owned wizard, or persistent draft state.
- Do not redesign ranking, favourite lookup, discovery, approval, or automatic-selection policy.

## Decisions

### Keep one picker resource with explicit presentation modes

Extend the existing strict picker payload with a small presentation discriminator and the minimum optional changed metadata needed for `proposal`, `choices`, and `recap`. Keep `review_proposed_basket` and `ui://nemlig/picker.html`; do not duplicate resource packaging or introduce another tool.

### Reuse one compact product row

Refine `ProductCard` into one responsive row used by all modes. The row keeps a larger product image beside name, brand, package, package count, price, confidence, and favourite provenance. Existing populated evidence disclosures stay available beneath the summary. There is no status column, nested scroller, virtual list, review checkbox, or search input.

### Conversation owns corrections

The proposal view explains that the user can name incorrect ingredients in chat and keep everything else. The browser sends no automatic correction message. ChatGPT interprets the correction, preserves unchallenged selections, and calls the existing read-only review tool again with only challenged items plus their bounded candidates in `choices` mode.

### Radio controls settle focused replacements locally

In `choices` mode, each challenged ingredient presents the selected candidate and supplied alternatives as one native radio group. Choices remain local until the user submits them once through the existing `sendMessage` boundary. Pending, duplicate-send, stale-completion, recoverable-failure, and no-automatic-retry behavior reuse the current host-message lifecycle.

The consolidated message contains only ingredient, chosen product ID, and requested quantity. ChatGPT combines those replacements with retained selections and renders a `recap` payload. No browser-side provider or basket call is possible.

### Final recap precedes the protected write flow

`recap` shows every final product and a subtle `Changed` label only on replaced lines. Its `Add to Nemlig basket` action sends one explicit conversational approval message for the exact recap. ChatGPT must still run `review_items_to_add` and then `add_approved_items`; server-side authorization, freshness, single-use, cancellation, no-retry, and readback rules remain authoritative. The UI action is not a direct mutation.

### Keep list selection and exploration out of this change

ChatGPT can collect and refine the requested shopping list conversationally before product discovery. Separate exploration work may share proven visual pieces later, but this change does not invent a second client protocol or abstraction.

## Risks / Trade-offs

- **The model coordinates stages** → encode the sequence in server/tool instructions and keep complete structured fallback data so non-App clients follow the same contract.
- **A correction creates another read-only turn** → search only challenged ingredients and reuse existing bounded coordination; do not refetch retained lines.
- **A recap message can grow** → retain the fifty-item bound and send only stable identifiers and quantities.
- **Local radio choices can be lost on a new host payload** → submission is one deliberate action; add persistence only if observed testing proves it necessary.
- **A product row can become dense** → keep one responsive layout and native disclosures; verify narrow rendering and text resizing instead of adding alternate renderers.

## Migration Plan

1. Add failing contract and lifecycle tests for the three presentations and protected handoffs.
2. Implement the smallest payload and picker changes while reusing current components and host-message guards.
3. Update MCP guidance, fallback text, synthetic showcase, and README.
4. Run focused and repository verification, archive the completed change, and deliver through the protected release workflow if the version policy selects a release.

Rollback restores the previous bundled picker and guidance. No data or provider migration is required; `NEMLIG_MCP_APPS` remains the existing emergency UI fallback.
