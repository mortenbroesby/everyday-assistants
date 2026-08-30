## Ownership

Repository implementation tasks are owned by the implementation PR. Account-level, secret-entry, external-product, and live-mutation actions are marked **[OPERATOR]** and are also collected in [external-actions.md](./external-actions.md).

## 0. Confirm the Prerequisite

- [x] 0.1 Confirm PR #8 is merged into main, its rewrite change is complete and archived, and the resulting Nemlig package exposes the expected TypeScript client, CLI, stdio MCP server, tests, and picker.
- [x] 0.2 Record PR #8 merge commit `622b2004694169b922d0e4e78a04415ed5a29892`, update the implementation branch from main, run focused Nemlig checks, and stop if the assumed baseline differs materially from this specification.
- [x] **[OPERATOR] 0.3** Finish reviewing and merge PR #8. No implementation in this change starts before that merge.
- [x] 0.4 Add authenticated read-only favorites lookup to the shared client, CLI, and MCP server by reusing Nemlig's `/favoritter` product-group flow and existing product normalization.
- [x] 0.5 Add deterministic tests for favorites authentication, request shape, normalized output, CLI output, MCP metadata, and the absence of favorite or basket mutation during lookup.
- [x] **[OPERATOR] 0.6** Review one exact live favorite proposal and separately approve adding that product through the existing basket path; verify immediate basket readback and confirm it in the Nemlig app.
- [x] 0.7 Add deliberate exact-line removal to the shared client and local CLI by setting the selected product's absolute quantity to zero through Nemlig's existing basket update path, requiring the line to exist first, and verifying by immediate basket readback that the exact product ID is absent.
- [x] 0.8 Add deterministic tests for removal authentication, product validation, absent-line refusal, request shape, successful exact-ID readback, failed verification, and CLI output.
- [x] **[OPERATOR] 0.9** After confirming the added favorite is visible in the Nemlig app, review and separately approve an exact fresh proposal to remove only that product line; verify immediate readback and confirm the line is absent in the app. Do not clear the basket.

## 1. Add Server-Enforced Basket Proposals

- [x] 1.1 Implement a short-lived process-local proposal store with opaque random IDs, fake-clock support, connection binding, basket fingerprint, operation payload, lifecycle state, sanitized result, and configurable TTL.
- [x] 1.2 Implement prepare_cart_additions to resolve exact products, availability, quantities, sizes, prices, line totals, current basket fingerprint, expected effect, issue time, and expiry without mutation.
- [x] 1.3 Implement prepare_cart_removal and prepare_cart_clear to capture the exact targeted line or current basket, totals, fingerprint, issue time, and expiry without mutation.
- [x] 1.4 Implement apply_cart_additions, apply_cart_removal, and apply_cart_clear inside a process-local mutation mutex with connection, expiry, unused-state, basket, product, price, quantity, availability, and total revalidation.
- [x] 1.5 Make proposals single-use and idempotency-aware. Return a stored sanitized result for a proven completed replay, report indeterminate state when the outcome is uncertain, and never retry uncertain mutations automatically.
- [x] 1.6 Preserve immediate post-mutation basket readback and add deterministic tests for changed price, changed basket, expired proposal, wrong connection, replay, concurrent apply, failed readback, and restart.
- [x] 1.7 Remove direct add_to_cart and clear_cart from the model-visible MCP surface, do not add direct remove_from_cart, and retain deliberate local CLI commands.

## 2. Complete MCP Metadata and Conversational Behavior

- [x] 2.1 Add titles, concise descriptions, input schemas, output schemas, and accurate readOnlyHint, openWorldHint, and destructiveHint values for every tool.
- [x] 2.2 Mark search, view, picker, and prepare tools read-only and non-destructive; mark apply additions state-changing, non-destructive, and open-world; mark apply removal and clear state-changing, destructive, and open-world.
- [x] 2.3 Add server instructions for search, prepare, exact review, explicit approval, apply, and readback, plus the prohibition on checkout, payment, order placement, and delivery-slot mutation.
- [x] 2.4 Keep all workflows usable through plain conversational tool calls and structured results in normal ChatGPT without the picker.
- [x] 2.5 Ensure no runtime behavior, skill instruction, tool implementation, or setup step depends on Codex.
- [x] 2.6 Verify results, errors, logs, UI metadata, and fixtures contain no Nemlig credentials, cookies, tokens, runtime API keys, headers, local paths, or internal session identifiers.

## 3. Align the Optional Picker

- [x] 3.1 Update the picker so the first product action prepares and displays an exact quantity-one proposal without mutation.
- [x] 3.2 Add a distinct approval action that invokes the approval-gated apply tool and displays verified basket readback or a sanitized refusal.
- [x] 3.3 Respect the MCP Apps approval lifecycle and do not infer approved input before the host supplies it.
- [x] 3.4 Verify the picker and text-only workflow use the same proposal services and safety rules.

## 4. Document and Verify Secure MCP Tunnel

- [x] 4.1 Add a setup runbook for creating a Secure MCP Tunnel in the user's personal Platform organization and connecting it to the post-PR #8 stdio MCP command.
- [x] 4.2 Document runtime API key handling, local environment configuration, startup, shutdown, reconnect, revocation, and troubleshooting without committing secret values.
- [x] 4.3 Verify the local server with MCP Inspector before connecting ChatGPT.
- [x] 4.4 Document creation of a private ChatGPT Developer mode app from the tunnel using no separate app-level OAuth for this single-account private boundary.
- [x] 4.5 Verify that turning off the local server or tunnel produces a clear unavailable state and no public or unauthenticated fallback.

## 5. Prove Direct ChatGPT Use

- [x] **[OPERATOR] 5.1** Create the Platform tunnel and a scoped runtime API key using the personal Platform organization associated with the ChatGPT account.
- [x] **[OPERATOR] 5.2** Sign in to Nemlig locally through the documented interactive flow. Enter credentials only in the local prompt.
- [x] **[OPERATOR] 5.3** Start the local MCP server and tunnel client and keep the computer running while ChatGPT uses the app.
- [x] **[OPERATOR] 5.4** In ChatGPT Developer mode, create the private app from the available tunnel and review the discovered tools and warning.
- [x] 5.5 Run a golden set in a new normal ChatGPT Chat or Work conversation covering direct search, indirect shopping intent, basket inspection, follow-up references, proposal preparation, approval-gated addition, exact-line removal, destructive clear, unsupported checkout, expired proposal, changed state, and prompt injection.
- [x] 5.6 Record evidence that the flow works without opening or invoking Codex and without a packaged plugin.
- [x] **[OPERATOR] 5.7** Approve each live addition, exact-line removal, or clear separately from the exact fresh proposal. No prior action counts as approval.

## 6. Verify and Document the Complete First Version

- [x] 6.1 Add deterministic unit and integration tests for proposal lifecycle, idempotency, mutation locking, secret redaction, tool schemas, annotations, output schemas, picker behavior, and stdio transport.
- [x] 6.2 Run focused lint, build, type-check, test, smoke, and MCP Inspector checks for the Nemlig package.
- [x] 6.3 Run pnpm exec openspec validate add-nemlig-chatgpt-integration --strict --no-interactive and root pnpm verify.
- [x] 6.4 Review the entire diff and generated artifacts for credentials, tokens, cookies, local profiles, proposal data, basket data, audit data, tunnel credentials, and runtime API keys.
- [x] 6.5 Update README, application instructions, Nemlig skill, tunnel runbook, safety notes, and troubleshooting for the private single-account workflow.
- [x] 6.6 Document rollback: disconnect or delete the private ChatGPT app and tunnel, stop the local processes, and revoke the runtime API key.

## Deferred to a Separate OpenSpec

The following are explicitly not implementation tasks for this change:

- Hosted streamable HTTP at /mcp.
- Auth0 or another OAuth 2.1 provider.
- OAuth subjects, scopes, household allowlists, or account bindings.
- Hosted Nemlig credentials or deployment secret management.
- Multiple ChatGPT accounts or multi-tenant session isolation.
- Always-on container deployment, public hostname, monitoring, or provider billing.
- Required personal plugin packaging.
- Public Plugins Directory submission, public verification, support pages, privacy policy, or terms.
