## Why

Nemlig already owns durable shopping lists with stable IDs. Keeping a separate
Local basket inventory, line store, expiry policy and selection registry adds
another source of truth and prevents the assistant from naturally showing lists
created in Nemlig itself.

## What Changes

- Use one native Nemlig shopping list per saved selection. Its provider ID,
  scoped to the connected account, is its identity; no app basket ID or mapping
  registry is needed. List all accessible lists, including manually created ones.
- Call these **Shopping lists** and **Shopping list** throughout the product.
  Reserve **Nemlig basket** for the actual basket receiving approved additions.
- A conversation may remember a selected provider list ID as a disposable hint.
  Missing selection shows the list picker. A deleted list clears that reference;
  it never recreates a list or redirects the failed edit into another list.
- Ideation starts an **Unsaved draft** in temporary conversation memory.
  Accepting or editing draft products does not save them. **Save as shopping
  list** explicitly creates a native list with the current exact draft products
  and quantities; only verified completion changes the view to a saved list.
- Unsaved products may disappear after inactivity, session loss or restart. Saved
  lists remain discoverable on Nemlig. Reuse the existing draft product UI for
  both the unsaved draft and every selected native shopping list.
- **BREAKING:** disable the Local Basket workflow and route historical Local
  Basket cards to native-list discovery. Keep existing account data, storage
  bindings, callbacks and namespace intact until a separately reviewed
  migration and retirement plan. Do not migrate old data automatically.
- Keep shopping-list-to-basket submission disabled until exact transfer and
  concurrent-edit behavior are verified. Retain durable Save/Update recovery
  records; any later transfer fence and source-list cleanup require separate
  verified semantics.

## Capabilities

### New Capabilities

- `nemlig-shopping-lists`: native identity, complete account list discovery,
  verified editing, missing-list handling and conversation selection.

### Modified Capabilities

- `nemlig-product-review`: explicit draft-to-list saving, temporary ideation and
  shopper naming instead of a durable Local basket.
- `nemlig-mcp`: provider-backed actions, explicit list targets and truthful
  mutation annotations.
- `nemlig-basket-proposals`: source-list binding, restart-safe no-replay and
  successful-submission cleanup.
- `nemlig-cloudflare-hosting`: removal of local basket infrastructure, isolated
  submission safety storage and controlled namespace retirement.

## Impact

See design.md for the file-level removal/reuse map. No new package or persistence
service is proposed. Native list editing now requires a connected Nemlig account
and network access. ChatGPT host metadata is optional convenience, never authority.

### Goal and non-goals

The long-term goal is one native shopping-list model from discovery through
editing and submission, with no durable local-basket persistence. This PR
checkpoint implements discovery, draft Save, staged Update, and durable
Save/Update recovery. The current draft branch also contains a saved-list
submission path. The owner accepts the possible concurrent native edit between
the final contents read and provider transfer when the path performs its exact
contents and basket checks, one transfer, additive readback, and durable
no-replay safeguards. Issue #295 selects deletion of the complete source list
after a confirmed completed submission, including known-unavailable products.
The native transfer path in this checkpoint still retains that source, so
cleanup implementation and recovery remain incomplete. Local Basket storage
retirement remains separately gated. Temporary unsaved drafts remain. This
plan does not authorize live provider mutation, deployment, or deletion of old
user data.

### Acceptance

1. A fresh chat sees all account lists; selection survives only as a hint and is
   revalidated. Another account cannot use a guessed or stale list ID.
2. Ideation and draft edits make no provider writes. Explicit save persists the
   reviewed draft contents once with exact readback. Saved-list edits remain
   transient until Update shopping list; external changes preserve pending
   intent and show current provider contents before another explicit Update.
   Unsaved drafts have no recovery promise. Uncertain saves or updates are
   never blindly replayed.
3. Confirmed deletion yields the picker; auth/network errors remain errors and
   cannot masquerade as an empty inventory or missing list.
4. Explicit saved-list submission checks the final exact contents and basket
   baseline, makes one native transfer, verifies the additive basket readback,
   and retains a durable no-replay receipt. The owner accepts that a concurrent
   Nemlig-side edit after the final contents read may affect the provider
   transfer. Issue #295 selects deletion of the complete source after confirmed
   completion, including known-unavailable products. This checkpoint's native
   path still retains it; uncertain outcomes and observed external edits do not
   authorize deletion or retry.
5. Local Basket mutations are inactive and stale cards fail closed. Durable
   Local Basket data, callbacks, bindings, and namespace remain pending an
   explicit migration and retirement disposition. Save/Update journal tests
   cover restart recovery and owner scoping.
6. Storybook, MCP smoke and an explicitly authorized live ChatGPT test cover the
   unsaved/save states, all-list picker, reopening through the draft UI, staged
   edits, explicit Update, external-edit conflicts, failed writes and missing
   lists. A 50+ product submission remains blocked until the provider's
   conditional-transfer or isolated-snapshot contract is proven.

### Delivery and existing work

Implementation is continuing on PR #296's `codex/plan-native-shopping-lists`
branch. Its submission path re-reads the exact source contents and basket
baseline, sends one native list transfer, verifies additive basket readback,
and retains a durable no-replay receipt. It keeps the source list after
success. Issue #295 selects consuming the entire source after confirmed
completion, including known-unavailable products; this native path does not yet
implement that cleanup. The owner accepts the remaining race between the final
client read and provider transfer when the stated safeguards are present.
Keep the source and report cleanup pending until the native path has a tested
eligibility check, durable cleanup recovery and no-replay behavior. PR #294 is
merged in main at `ea56ce3`; its temporary-list cleanup behavior does not prove
safe cleanup of a user-owned native shopping list. Keep Local Basket namespace
deletion separately gated.
This change supersedes the unimplemented sections 2–3 of
`provider-shopping-list-core-workspace`: its two-list design and mandatory
workspace registry are rejected. Its shipped list-only submission safeguard and
the earlier `provider-shopping-list-workspace` proof remain dependencies.
Reconcile those change records and issue #276 during implementation rather than
marking their unfinished work complete. Follow-up issue [#295](https://github.com/mortenbroesby/everyday-assistants/issues/295)
is the work contract; this OpenSpec change is the durable design.
