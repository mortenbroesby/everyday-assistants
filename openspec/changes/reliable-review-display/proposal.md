## Why

The Shopping List Update investigation (#345) demonstrated a text-only show path and misleading model-facing actions. Merged #346 repairs the immediate metadata defect; a dedicated read-only renderer makes natural display intent discoverable without mixing rendering, draft edits, and basket authorization.

## What Changes

- Add `show_product_review` for an existing authenticated draft or an explicitly requested saved-list picker. Ordinary English/Danish display intent is described in metadata and server guidance.
- Separate model-facing preparation/edit tools from the hosted renderer, preserving the existing shell, app callbacks, and text-only stdio behavior. **BREAKING:** clients expecting start/update to automatically mount the review must call the display tool instead.
- Preserve exact draft/context identity; allow implicit display only within a trustworthy current session, never an account-wide latest-draft guess. Missing/stale context produces actionable recovery without recreation.
- Add focused MCP/browser regressions and a bounded prompt/host acceptance matrix that distinguishes model selection from rendering and mutation safety.

## Capabilities

### New Capabilities

None; this extends the existing MCP contract.

### Modified Capabilities

- `nemlig-mcp`: eight model-visible tools, dedicated display metadata, natural-language routing guidance, owner-scoped read-only display, and distinct host acceptance evidence.

## Impact

Primary code: `apps/nemlig-assistant/src/mcp.ts`, review identity accessors only if required, production acceptance, interface tests, and review browser smoke fixtures. README and relevant MCP instructions change with the tool catalog. No new dependencies, infrastructure, persistent user-data store, paid evaluation service, provider-write path, or URI rotation.

The canonical delivery contract is [epic #347](https://github.com/mortenbroesby/everyday-assistants/issues/347), with five stories and task checkboxes. One branch `codex/nemlig-review-display` and one PR contain this change, based on main `254789f61bfc73b7791e950e45691c5293ce0a85`. Astra owns design/integration; Terra owns implementation.

Non-goals: redesigning the editor, rebuilding lost drafts, adding product inference, changing basket submission/storage/auth, merging/deploying, or performing live basket mutations. Acceptance requires read-only exact-target display, correct metadata and callers, preserved UI journey, focused regressions and exact-head CI. Native ChatGPT selection/rendering is a separately recorded release gate when the candidate is available to the host; static tests never count as native acceptance.
