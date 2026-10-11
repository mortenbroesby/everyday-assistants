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
- Accepted products and quantities live only in Nemlig. Undecided suggestions
  and alternatives remain temporary review state, not a second saved list.
- **BREAKING:** retire local basket content, inventory, TTL/heartbeat, eviction,
  callbacks, capability transport, storage binding and repository abstraction.
  Old local IDs become unavailable; there is no automatic provider migration.
- Preserve exact approved, add-only basket submission and the post-success list
  cleanup from PR #294. Isolate the minimum durable anti-replay submission record
  from shopping content; do not keep a basket registry to provide this safeguard.

## Capabilities

### New Capabilities

- `nemlig-shopping-lists`: native identity, complete account list discovery,
  verified editing, missing-list handling and conversation selection.

### Modified Capabilities

- `nemlig-product-review`: native saved selections, temporary suggestions and
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

The goal is one native shopping-list model from discovery through editing and
submission, with no active local-basket persistence. This plan does not implement
code, mutate provider data, deploy, merge PR #294, delete old user data, redesign
swipe/details controls, add offline editing, or build background synchronization.

### Acceptance

1. A fresh chat sees all account lists; selection survives only as a hint and is
   revalidated. Another account cannot use a guessed or stale list ID.
2. Accepted edits persist in Nemlig, survive app restart and return exact readback.
   External changes appear on refresh; uncertain writes are never blindly replayed.
3. Confirmed deletion yields the picker; auth/network errors remain errors and
   cannot masquerade as an empty inventory or missing list.
4. One exact authorized submission makes at most one native transfer, preserves
   existing basket items, and deletes only the eligible corresponding source
   list after verified success. Failure or uncertainty preserves recovery state.
5. Local-basket runtime infrastructure is removed. Tests prove anti-replay after
   process restart, cross-chat contention, and stale-card fail-closed behavior.
6. Storybook, MCP smoke and an explicitly authorized live ChatGPT test cover the
   new names, all-list picker, edits, missing lists and a 50+ product submission.

### Delivery and existing work

Planning branch: `codex/plan-native-shopping-lists`, one documentation PR.
Implementation: one follow-up epic branch/PR with checkpoint commits; do not mix
it into PR #294. Rebase on #294 when merged, or carry its reviewed behavior once.
This change supersedes the unimplemented sections 2–3 of
`provider-shopping-list-core-workspace`: its two-list design and mandatory
workspace registry are rejected. Its shipped list-only submission safeguard and
the earlier `provider-shopping-list-workspace` proof remain dependencies.
Reconcile those change records and issue #276 during implementation rather than
marking their unfinished work complete. Follow-up issue [#295](https://github.com/mortenbroesby/everyday-assistants/issues/295)
is the work contract; this OpenSpec change is the durable design.
