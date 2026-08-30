# External Actions Owned by the Operator

This OpenSpec describes repository work. It does not create external resources, enter credentials, accept ChatGPT warnings, or authorize a real basket change.

The first version now assumes one ChatGPT account, one shared Nemlig account, private Developer mode use, and Secure MCP Tunnel. It does not assume hosting, Auth0, multiple identities, public publishing, or a packaged plugin.

## Public evidence boundary

This archived change records the required operator workflow without publishing
account-specific tunnel state, credentials, favorites, basket contents, product
choices, or live mutation evidence. Repository tests and synthetic fixtures are
the portable verification record. Anyone adopting the private tunnel performs
their own owner actions and keeps the resulting evidence local.

## Required before implementation

- [x] Finish reviewing and merge PR #8. Confirm its rewrite OpenSpec is complete and archived.
- [x] Confirm the one-account, local-tunnel availability trade-off remains acceptable: ChatGPT can use Nemlig only while the local computer, MCP server, and tunnel client are running.

## Required to connect ChatGPT

These actions require the operator's accounts, computer, or secrets and must happen outside the implementation PR:

- [x] In the OpenAI Platform organization associated with the target ChatGPT workspace, create a Secure MCP Tunnel for this application.
- [x] Create the tunnel runtime API key required by the tunnel client. Keep it in local secret storage or environment configuration and never put it in ChatGPT, GitHub, command history, logs, or committed files.
- [x] Sign in to Nemlig locally using the repository's documented interactive login. Enter the Nemlig password only in the local terminal prompt.
- [x] Start the post-PR #8 stdio MCP server and the Secure MCP Tunnel client using the implementation runbook.
- [x] Keep the local computer, MCP server, and tunnel client running while ChatGPT uses the integration.
- [x] In ChatGPT Plugins or Apps Developer mode, create the private app from the available tunnel, use the documented single-account authentication setting, review the discovered tools, and accept the private developer-app warning if satisfied.
- [x] Open a new normal ChatGPT Chat or Work conversation and run the initial read-only golden prompt for basket and favorites.
- [x] Confirm that search, shopping-list compilation, basket inspection, and proposal preparation operate on the intended Nemlig account, with an independent normal-ChatGPT basket read proving the no-Codex path.

The implementation PR must provide exact commands and expected outputs. The operator must provide secrets only through the local interactive or secret-handling paths described by that runbook.

## Live Nemlig safety boundary

- Read-only search and basket inspection may run after local setup.
- Every real addition, exact-line removal, or basket clear requires a fresh exact proposal and a separate explicit approval at the time of the action.
- Approval is limited to the exact products, quantities, prices, operation, and basket state represented by that proposal.
- Login, tunnel creation, app creation, plugin installation, proposal preparation, this OpenSpec, and implementation work do not count as mutation approval.
- Checkout, payment, order placement, and delivery-slot changes remain manual on Nemlig and outside this change.
- Credentials, cookies, tokens, authorization headers, and runtime API keys must never be entered in ChatGPT or GitHub content.

## Explicitly not required for this first version

The operator does not need to do any of the following for the private single-account tunnel version:

- Create an Auth0 tenant or configure OAuth.
- Create separate ChatGPT identities or household-user allowlists.
- Approve hosted storage of the Nemlig password.
- Choose or pay for a hosting provider.
- Create a public HTTPS hostname or domain.
- Deploy a long-lived container.
- Package or install a separate personal plugin.
- Submit to the public Plugins Directory.
- Complete public developer or business verification.
- Provide review credentials.
- Publish a support site, privacy policy, or terms page.

## Future decision gate

If any of these become requirements, stop and create a separate OpenSpec before implementation:

- Always-on availability while the local computer is off.
- Access from another ChatGPT account or workspace.
- A public or internet-reachable MCP endpoint.
- Hosted Nemlig credentials.
- Public or broader private distribution.
- Revocable per-person permissions or audit identity.

That future change must cover OAuth 2.1 with an established identity provider, account binding, per-user and per-account session isolation, hosted secret management, deployment operations, revocation, and the appropriate distribution review.
