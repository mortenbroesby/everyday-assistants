> Status: Superseded by the owner-approved temporary-draft and direct bulk
> Submit flow in #317, #318, and #336. Immediate native-list creation and
> automatic edit persistence are historical decisions, not current work.
> Unchecked tasks remain as historical evidence.

## Why

A real ChatGPT editing test retained edits until reload, then displayed the original unsaved draft; reopening returned unavailable. The user approved replacing temporary drafts with native Nemlig shopping lists from the first selected products, so Nemlig owns the durable contents throughout editing.

## What Changes

- **BREAKING:** Product selection creates a native list immediately, with a default name when none is supplied. Remove the public unsaved-draft and manual Save/Update workflow.
- Persist each explicit product addition, removal, replacement, or quantity change to the exact native list. Browsing/searching alternatives remains read-only.
- Reopen/remount by stable provider list ID; refresh current contents before allowing stale card edits. A missing list or failed read produces recoverable feedback, never silent recreation or selection of another list.
- Reuse existing creation/update recovery and basket-submission fences. Partial or uncertain writes stay explicit; never blindly repeat them.
- Keep explicit reviewed-list Submit, additive basket protection, and verified transfer cleanup separate from list editing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-product-review`: native list authority from first selection, automatic persistence, and safe remount/recovery.
- `nemlig-mcp`: native-only review targeting and truthful creation/edit tool semantics.

## Impact

Product-review service, MCP schemas/routing/annotations, viewer state and controls, relevant fixtures/tests/Storybook, plugin guidance, and app feature inventory. Reuse existing provider API and recovery storage; no new dependency, CI, auth, hosting, or persistence system.

Deliver as one PR on `fix/native-shopping-list-first`, from current main. This supersedes the unsaved/manual Save/Update contract in `native-shopping-lists-only`; it does not authorize migration/deletion of old user data or live provider tests.

### Acceptance and non-goals

Create once from exact selected IDs/quantities; persist edits on the intended account/list; reopen current provider contents after restart/reload; surface partial/uncertain results without duplicate lists, silent overwrite, or basket writes. Existing Submit safety remains tested. Search-only requests do not create lists. No offline draft model, migration of expired drafts, provider deployment, real basket test, or unrelated search-ranking improvement.
