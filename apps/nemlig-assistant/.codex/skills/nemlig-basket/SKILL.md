---
name: nemlig-basket
description: Safely search or list favorite Nemlig products, review a basket, and make exact explicitly approved basket changes with the local TypeScript CLI.
---

# Nemlig basket

Run commands from the Everyday Assistants repository root:

```sh
pnpm nemlig --help
```

## Workflow

1. View the existing basket before proposing changes:

   ```sh
   pnpm nemlig cart
   ```

   If login is required, ask the user to run `pnpm nemlig login --save`
   interactively. Never request credentials or pass a password in command
   arguments.

2. Search without mutating the basket:

   ```sh
   pnpm nemlig search "<danish-product-name>" --limit 5
   ```

   To use the authenticated account's existing favorites instead, list them
   without changing favorites or the basket:

   ```sh
   pnpm nemlig favorites --limit 5
   ```

3. For a list, collect exact products and quantities through independent reads.
   Use Nemlig's supplied description, details, package, price, availability and
   image, with a text fallback. Leave ambiguous or unavailable products unresolved.
   The application-owned planner and automatic submission authority are retired.

4. Wait for explicit approval of the exact unchanged products, quantities,
   current prices and basket effects. Local selection or acceptance is not
   provider-write approval. Any changed fact requires a fresh review and approval.

5. Add only approved lines:

   ```sh
   pnpm nemlig add <product-id> --quantity <quantity>
   ```

   The command automatically displays the resulting basket and total. Stop on
   partial success, failed readback, or mismatch.

Nemlig Assistant is add-only for the real provider basket. It has no remove,
replace, or clear operation. If the user wants to remove or reduce anything,
direct them to manage that directly on Nemlig.com. Never check out, pay, or
place an order.

## MCP workflow

Model-visible basket writes never call a direct mutation tool. Additions use
`review_items_to_add` → explicit exact approval → `add_approved_items`, or the
local review's `prepare_submission` → explicit exact approval →
`submit_product_review`. Both preserve fresh validation, principal binding,
single-use authority, serialization and verified basket readback. Never retry
an indeterminate result; inspect the draft and actual
basket before deliberately creating a fresh review.

Use `start_product_review` for an explicit new selection. To reopen, first use
`update_product_review` with action `show` and no old review ID or revision.
Only after it reports no active draft may you ask to start fresh. Never replay
a failed edit or restore old acceptance/submission authority. In Review and
Ready are local states, not the actual Nemlig basket; alternatives belong only
to In Review. Local acceptance, removal and ending do not mutate Nemlig.

For private ChatGPT use, follow `../../../../../docs/cloudflare-operations.md`.
Identity, infrastructure, and app changes remain owner actions and never
authorize a basket mutation.
