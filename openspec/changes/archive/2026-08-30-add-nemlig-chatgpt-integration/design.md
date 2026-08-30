## Context

This design starts from the expected merged result of PR #8. The baseline contains a Node.js 22 TypeScript Nemlig client, local credential loading, a CLI, a stdio MCP server, normalized product and basket data, safe post-mutation readback, and an optional MCP Apps picker.

The household currently has one ChatGPT account and one shared Nemlig account. The immediate need is private direct use from normal ChatGPT Chat and Work, not public distribution or always-on availability. Developer mode is already enabled on the ChatGPT account. Secure MCP Tunnel can connect the private local stdio server without public ingress while keeping Nemlig credentials on the computer.

The important distinction is between transport access and basket safety. For this narrow first version, access is restricted by the private tunnel and its associated ChatGPT account and Platform organization. Basket safety still must be enforced inside the MCP server because host confirmation and model instructions alone do not guarantee exact product, price, quantity, basket state, or replay behavior.

## Goals / Non-Goals

**Goals:**

- Make the local stdio MCP server usable directly from one private ChatGPT account.
- Keep normal ChatGPT Chat and Work as first-class clients.
- Keep Codex optional.
- Keep Nemlig credentials and authenticated session state local.
- Enforce exact, short-lived, single-use proposals for every model-visible basket write.
- Keep the picker optional and preserve a complete text-only workflow.
- Preserve the prohibition on checkout, payment, order placement, and delivery-slot mutation.

**Non-Goals:**

- An always-on hosted service or public HTTPS MCP endpoint.
- Auth0, separate app-level OAuth, OAuth scopes, user allowlists, account linking, or multiple ChatGPT identities.
- Public submission, developer verification, public legal pages, or listing.
- Required plugin packaging, branding, or starter prompts.
- Automatic basket mutation, background ordering, uncertain mutation retries, or checkout.

## Decisions

### Require PR #8 as the implementation baseline

Implementation SHALL begin only after PR #8 is merged, its rewrite OpenSpec is complete and archived, and the resulting CLI, client, stdio MCP server, tests, and picker pass focused verification on main. The implementation SHALL adapt the merged code rather than copying from the old feature branch.

### Use the private tunnel as the complete first deployment

The first version SHALL use Secure MCP Tunnel to connect the local stdio MCP server to a private ChatGPT Developer mode app.

The runtime path is:

1. Normal ChatGPT Chat or Work invokes the private app.
2. OpenAI routes the MCP call through the configured Secure MCP Tunnel.
3. The local tunnel client forwards it to the local stdio MCP server.
4. The MCP server uses the locally authenticated Nemlig client.
5. Sanitized structured results return through the same path.

The local computer, MCP server, and tunnel client must be running. This availability limitation is accepted for the first version because always-on access is not a current requirement.

No public network listener, hosted service, public hostname, or remote Nemlig secret storage is added.

### Treat the tunnel and one ChatGPT account as the narrow access boundary

The Developer mode app SHALL be private to the current ChatGPT account and SHALL use the tunnel connection without a separate app-level OAuth flow.

This is a project decision for a narrow deployment, based on all of the following constraints:

- There is one ChatGPT account.
- There is one household Nemlig account.
- The MCP server has no public ingress.
- The tunnel is associated with the user's personal Platform organization and ChatGPT workspace context.
- The tunnel client authenticates to OpenAI's tunnel control plane.
- Nemlig credentials never cross into ChatGPT configuration or tool arguments.

The server SHALL NOT accept an actor, account, credential, or authorization identity from tool input. Proposals may record an internal connection identifier for replay protection, but there is no OAuth subject or household-user mapping in this version.

This boundary must not be reused if the server becomes public, hosted, or available to another ChatGPT account. Any such expansion requires a separate design with OAuth 2.1, established identity-provider configuration, explicit account binding, session isolation, hosted secret management, and revocation.

### Keep one local session and serialize mutations

The local server may keep the post-PR #8 singleton Nemlig client because there is one process, one ChatGPT account, and one Nemlig account. It SHALL still use a process-local mutation mutex so two tool calls cannot concurrently mutate the shared basket.

Read operations may share the authenticated session. Every apply operation obtains the mutex, revalidates the proposal and current basket inside the lock, performs the exact operation once, and reads the basket back before releasing the lock.

### Reuse the product-group path for read-only favorites

The shared Nemlig client SHALL expose an authenticated favorites read that follows Nemlig's own `/favoritter` page and existing paginated product-group flow. It SHALL reuse the existing `Product` normalization, CLI formatting, MCP candidate shape, credential loading, and basket-add path.

The implementation SHALL add only `listFavorites` plus `favorites` CLI and `list_favorites` MCP entry points. It SHALL NOT add favorite writes, a separate add-from-favorites mutation, or a second product model. A returned favorite becomes an ordinary exact product candidate; all basket approval and mutation rules remain unchanged.

### Introduce server-enforced basket proposals

Replace model-visible add_to_cart and clear_cart with:

- prepare_cart_additions
- apply_cart_additions
- prepare_cart_removal
- apply_cart_removal
- prepare_cart_clear
- apply_cart_clear

Preparation is read-only. It resolves exact product data, current basket fingerprint, quantities, prices, line totals, expected basket effect, issue and expiry times, a local connection binding, and a random opaque proposal ID. Proposal payloads never contain credentials or Nemlig session identifiers.

Application is a write action. Inside the mutation lock it verifies connection binding, expiry, unused status, operation, current basket fingerprint, product identity, availability, price, quantity, and totals. Any mismatch invalidates the proposal and performs no mutation.

Proposal IDs are single-use and idempotency-aware. A replay after a known completed application returns the stored sanitized result without repeating the mutation. If the process loses state after an uncertain operation, the server reports an indeterminate result, requires basket inspection, and never retries automatically.

### Make schemas and annotations part of the safety contract

Every tool SHALL declare a title, concise description, input schema, output schema, and accurate annotations.

- search_products, view_cart, pick_products, prepare_cart_additions, prepare_cart_removal, and prepare_cart_clear are read-only and non-destructive.
- apply_cart_additions is state-changing, non-destructive, and open-world because it changes a third-party basket.
- apply_cart_removal and apply_cart_clear are state-changing, destructive, and open-world.

Annotations do not replace proposal validation, mutation locking, exact approval, or readback. Results and errors must exclude passwords, cookies, tokens, runtime API keys, headers, local paths, internal session identifiers, and stack traces.

### Keep conversational use independent of the picker and Codex

All shopping-list workflows SHALL work through plain conversational tool calls and structured results in normal ChatGPT. The picker may improve comparison and review but is not required.

Codex may connect to the same local MCP server or use the same repository during development, but no production workflow may require Codex to plan, invoke, authorize, or complete shopping actions.

### Change the picker from direct mutation to proposal review

Product cards show exact name, ID, size, price, availability, and relevant upstream labels. The initial action prepares a quantity-one proposal and displays the exact review. A separate explicit action invokes the approval-gated apply tool.

The component SHALL respect the MCP Apps approval lifecycle and SHALL NOT infer hidden approved arguments or mutate on initial selection.

### Defer plugin packaging and publishing

A private Developer mode app connection is sufficient for direct ChatGPT use. Packaging the connection as a personal plugin may later add branding, a bundled skill, icons, or starter prompts, but it is not required by this change.

Public submission is also deferred. No public developer verification, review credentials, support site, privacy policy, terms page, or directory listing is needed for this private first version.

### Verify without autonomous live mutation

Automated tests use synthetic Nemlig responses and fake clocks. MCP Inspector verifies the local server and tunnel-visible metadata. ChatGPT golden prompts cover search, basket view, proposal preparation, approval-gated addition, exact-line removal, destructive clear, negative cases, expired proposals, changed state, and prompt injection.

A live read-only smoke test may run after local sign-in. Every live addition, exact-line removal, or clear requires a new exact proposal and separate explicit approval at the time of testing. This design and its implementation do not supply that approval.

## Risks / Trade-offs

- [The local computer or tunnel is offline] -> Report the app as unavailable and document the exact restart sequence.
- [One ChatGPT account is shared by family members] -> Accept a single logical actor in this version and rely on exact proposal review for writes.
- [Two calls race on the shared basket] -> Serialize all writes and revalidate inside the lock.
- [Price or availability changes after review] -> Invalidate the proposal and require a fresh review.
- [The process restarts during a mutation] -> Never retry automatically; inspect the basket and report indeterminate state.
- [The private boundary later expands] -> Stop and create a new OAuth and hosting OpenSpec before exposing the service.
- [The unofficial Nemlig API changes] -> Keep fixture boundaries, sanitized errors, and no automatic mutation retry.
- [Picker behavior diverges from conversation] -> Route both through the same prepare and apply services and test headless operation.

## Migration Plan

1. Confirm PR #8 is merged and verify the expected baseline on main.
2. Add and verify authenticated read-only favorites lookup, then run one separately approved live favorite-to-basket proof through the existing add path. After the owner confirms the product is visible, optionally run one separately approved exact-line removal proof without clearing the basket.
3. Refactor the MCP mutation surface to use server-enforced prepare and apply services.
4. Add proposal storage, a local mutation mutex, exact revalidation, idempotency handling, and readback tests.
5. Update tool schemas, annotations, instructions, skill guidance, and picker behavior.
6. Add the Secure MCP Tunnel runbook without committing any local credentials or runtime API key.
7. Create the private Developer mode app from the tunnel and run the ChatGPT golden prompts.
8. Verify the full text-only workflow in normal ChatGPT Chat or Work without Codex.
9. Update documentation, run focused checks, strict OpenSpec validation, root verification, and a secret-leak review.
10. Roll back by disconnecting or deleting the private app and tunnel, stopping the local tunnel client, and revoking the runtime API key. Local CLI and stdio operation remain available.

A future always-on or multi-account version starts with a separate OpenSpec. It does not extend this implementation silently.
