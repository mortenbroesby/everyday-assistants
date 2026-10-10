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

4. Treat the real Nemlig basket as sacred and add-only. Never remove, decrease,
   replace, swap, or clear its contents, even if asked or explicitly approved;
   explain that the user can manage those actions directly on Nemlig.com. This
   prohibition applies to MCP, CLI, provider APIs, and production tests. Local
   Local basket removal and clearing are different operations and remain allowed.

   A requested quantity is an amount to add, not an absolute final quantity.
   If Nemlig already has two and the user authorizes adding two, the final
   quantity must be four. When the provider endpoint sets an absolute quantity,
   read the current basket, verify the exact line and freshness, and only send a
   positive resulting quantity strictly greater than the observed quantity.
   Fail closed for incomplete quantities or stale basket identity; missing
   prices do not block approved additions. Never send zero or a smaller
   quantity. Separate external edits made directly on Nemlig.com can still race
   the provider's non-atomic read/set boundary; do not claim cross-client locking.

5. A clear conversational instruction to add the exact unchanged Local basket
   is itself authorization for that exact positive addition. Do not
   ask for a redundant second conversational approval. For any other addition,
   obtain approval of the exact unchanged products and added quantities. Show
   current prices as estimates; Nemlig may change them before or during the
   addition. Local basket state alone is not provider-write authorization.
   Product identity, quantity, or basket-content changes require a fresh review.
   A product confirmed unavailable or missing may be skipped and reported while
   other approved products continue. A failed lookup is not proof of absence.

6. Add only approved lines:

   ```sh
   pnpm nemlig add <product-id> --quantity <quantity>
   ```

   The command automatically displays the resulting basket and any known total.
   Stop on uncertain writes, failed readback, or quantity mismatch.

The CLI and MCP have no actual-basket remove, replace, swap, or clear operation.
Never add such a path. The user manages destructive changes directly on
Nemlig.com. Never check out, pay, or place an order.
Nemlig Assistant is add-only for the real provider basket. If the user wants to
remove or reduce anything, direct them to manage that directly on Nemlig.com.

## MCP workflow

Model-visible basket writes never call a direct mutation tool. Additions use
the Local basket's `prepare_submission` → its existing exact confirmation →
`submit_product_review`. This is the assistant provider-basket write
path and only adds positive quantities. A clear instruction to add the exact
unchanged Local basket supplies authorization without a redundant second
chat approval; UI confirmation remains as designed. The path preserves fresh
validation, principal binding, single-use authority, serialization and verified
basket readback. Never retry an indeterminate result; inspect the draft and
actual basket before deliberately creating a fresh addition review.
The user's clear conversational instruction to add the exact unchanged Local
basket is authorization for that prepared payload; do not ask for redundant
chat approval. Other additions require approval of the exact prepared change.
Never retry an indeterminate result; inspect the Local basket and actual basket
before deliberately preparing a fresh addition.

Use `start_product_review` for an explicit new Local basket. To reopen, first use
`update_product_review` with action `show`. Only after it reports no active basket
may you ask to start fresh. Never replay a failed edit or restore old submission
authority. Every Local basket row is a submission candidate, including after a
replacement. Local removal and ending do not mutate the actual Nemlig basket.

For private ChatGPT use, follow `../../../../../docs/cloudflare-operations.md`.
Identity, infrastructure, and app changes remain owner actions and never
authorize a basket mutation.
