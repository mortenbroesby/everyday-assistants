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

3. Present one proposal containing each product's exact name, ID, package or
   size, quantity, price, and expected line total. State uncertain choices. Do
   not mutate yet.

4. Wait for explicit approval of the exact proposal. Any changed product,
   quantity, price, or total requires a new proposal and approval.
   Do not ask twice when the user already explicitly approved every exact detail
   in the unchanged proposal, even if that approval came before preparation.

5. Add only approved lines:

   ```sh
   pnpm nemlig add <product-id> --quantity <quantity>
   ```

   The command automatically displays the resulting basket and total. Stop on
   partial success, failed readback, or mismatch.

To remove one exact product line, first display its current product ID, name,
quantity, and total and obtain a separate explicit approval. Then run:

```sh
pnpm nemlig remove <product-id>
```

The command sets only that product's absolute quantity to zero and verifies by
readback that its ID is absent. It never clears the basket.

Before clearing a basket, display its exact contents and total and obtain
explicit approval. Never replace a basket, check out, pay, or place an order.

## MCP workflow

Model-visible basket writes never call a direct mutation tool. Call the matching
`prepare_cart_*` tool, show its exact review, and wait for explicit approval of
that unchanged proposal unless the user already explicitly approved every exact
detail it contains. Never ask twice for the same unchanged proposal. Only then
call the matching `apply_cart_*` tool with
its opaque proposal ID. Preparation is not approval. Never retry an
indeterminate apply result; inspect the basket and prepare a new proposal.

For private ChatGPT use, follow `SECURE_MCP_TUNNEL.md`. Tunnel creation, runtime
keys, and app creation remain owner actions and never authorize a basket
mutation.
