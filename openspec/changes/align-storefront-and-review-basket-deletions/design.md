## Context

The public storefront bundle contains separate basket quantity and clear operations. The owner explicitly replaced the former blanket prohibition for two reviewed actions.

## Goals / Non-Goals

Support exact whole-line removal and whole-basket clear. Checkout, changes to orders, substitutions and partial reductions remain outside scope.

## Decisions

Resolve only same-origin category suggestions without customer credentials. Require the v3 canonical category breadcrumb before using results.

Review the complete basket and bind confirmation to the edit, identity and contents. Consume the MCP confirmation before applying. CLI confirmation stays in the reviewing process. Re-read immediately before writing, dispatch once and independently read back all surviving lines. Decline basket states the adapter cannot represent faithfully.

## Risks / Trade-offs

External Nemlig clients can change a basket between preflight and write. No provider-side conditional write was established. Report a readback mismatch as uncertain. The CLI collects confirmation in the interactive terminal. In MCP the host conveys the user’s confirmation after displaying the review. The server validates the single-use review and authenticated owner. It cannot independently inspect chat messages. A process restart invalidates pending MCP reviews. Simultaneous external additions can be removed by a clear even when the final empty readback matches. Both channels display this risk before confirmation.
