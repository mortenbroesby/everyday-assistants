## Why

`plan_my_shopping` converts an expired-session HTTP 401 into `discovery_unavailable` for every line, so the outer authenticated-read recovery never runs even though direct catalogue search works. Its attached picker then renders empty quantity controls and a dead preparation action, which makes a recoverable search failure look like twenty valid “no product” decisions.

## What Changes

- Keep ordinary whole-list planning conversational and agent-operated without automatically opening an interactive picker.
- Let an authentication failure escape per-line discovery handling so the existing authenticated-read wrapper can re-login once and retry the read-only plan.
- When individual catalogue discovery remains unavailable, return explicit model-visible guidance that identifies `find_groceries` as the read-only per-line workaround.
- Reserve the picker for explicit visual-choice requests and render selection controls only for real candidates.
- Replace empty or failed picker rows with a clear status explaining whether no match exists or discovery failed, without quantity inputs or a preparation button.
- Record a lower-priority visual follow-up for cleaner candidate cards with a title, concise description, approved product image, price, and one obvious selection action.
- Keep all planning, fallback, and picker behavior read-only; no basket mutation is authorized by this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Whole-list planning recovers expired authentication, exposes a direct-search workaround for remaining per-line discovery failures, and stays conversational unless visual choice is explicitly requested.
- `nemlig-chatgpt-integration`: ChatGPT can complete ordinary planning without rendering UI and only presents interactive choice when usable candidates exist.
- `nemlig-mcp`: Tool metadata and picker behavior separate agent planning from explicit visual choice and prevent meaningless controls for failed or empty results.

## Impact

- Affected runtime: `apps/nemlig-assistant/src/plans.ts`, MCP tool metadata/instructions, and the shared picker resource.
- Affected verification: focused plan, MCP interface, and picker behavior tests plus the repository verification gate.
- No new dependency, storage, provider, secret, or cost-bearing service is introduced. Existing concurrency limits, one-retry authentication recovery, quotas, and mutation approval boundaries remain unchanged.

## Goal

The supplied multi-recipe chat can resolve current Nemlig products through the agent without showing a picker, and an explicitly requested picker never offers controls that cannot produce a valid choice.

## Non-goals

- Redesigning every visual detail in this release.
- Adding alternate product providers, favourites fallback, saved shopping state, checkout, payment, ordering, or delivery-slot behavior.
- Retrying basket mutations or weakening exact proposal and approval rules.

## Acceptance Criteria

- A 401 raised by any planning catalogue read triggers the existing single re-login and one whole-plan retry instead of returning `discovery_unavailable` for every line.
- A non-auth discovery failure remains isolated to its line and tells the model to use `find_groceries` for that line.
- `plan_my_shopping` has no UI resource association and remains fully usable through structured conversational results.
- `choose_products_visually` remains available only when Apps are enabled.
- Picker output with candidates shows selectable products; output with no candidates or failed discovery shows a clear non-actionable status with no quantity field or prepare button.
- Focused tests and `pnpm verify` pass, and no basket mutation occurs during verification.
