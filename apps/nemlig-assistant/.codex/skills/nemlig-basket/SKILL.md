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
   prohibition applies to MCP, CLI, provider APIs, and production tests.

   A requested quantity is an amount to add, not an absolute final quantity.
   If Nemlig already has two and the user authorizes adding two, the final
   quantity must be four. When the provider endpoint sets an absolute quantity,
   read the current basket, verify the exact line and freshness, and only send a
   positive resulting quantity strictly greater than the observed quantity.
   Fail closed for incomplete quantities or stale basket identity; missing
   prices do not block approved additions. Never send zero or a smaller
   quantity. Separate external edits made directly on Nemlig.com can still race
   the provider's non-atomic read/set boundary; do not claim cross-client locking.

5. A clear conversational instruction to add exact products and positive
   quantities is authorization for that exact addition. Do not ask for
   redundant approval. For any other addition, obtain approval of the exact
   products and added quantities. Show current prices as estimates; Nemlig may
   change them before or during the addition. A native shopping list is
   separate from the actual basket. Selecting products for visual editing
   creates that list immediately, and later list edits persist automatically.
   Neither action changes the actual basket or authorizes a basket addition.
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

Search and browse products read-only. When the user chooses products for visual
editing, create a native Nemlig shopping list immediately. Persist each add,
remove, replacement, and quantity edit to that exact list automatically. To
reopen after a refresh or server restart, use the exact `shopping_list_id` and
read the list before enabling edits. If a list edit is uncertain, refresh that
same list and resolve the recorded change; never silently switch lists or retry
an uncertain write. Submit only the exact reviewed `shopping_list_id` and
`reviewed_list` after separate user authorization. The server re-reads that
same list, applies the existing durable no-replay fence, and verifies additive
basket readback. Never retry an indeterminate basket result; inspect the actual
basket and reconcile the shopping list without replaying the write.

Retired Local Basket IDs and actions, including `basket_id`, `delete`, and
`heartbeat`, fail tool argument validation. They do not open a picker or resolve
to another list. Use action `list` to discover native lists, then select one by
its exact ID. A fresh product selection requires a caller-generated
`creation_id`; reuse it only to inspect or recover that same creation. Never
generate a new ID automatically after an uncertain creation.

For private ChatGPT use, follow `../../../../../docs/cloudflare-operations.md`.
Identity, infrastructure, and app changes remain owner actions and never
authorize a basket mutation.
