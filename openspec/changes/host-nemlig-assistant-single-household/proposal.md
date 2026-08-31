## Why

The private ChatGPT app currently depends on the owner's Mac, login session,
local MCP process, and Secure MCP Tunnel. The product feature set is ready for
alpha testing, so availability and verifiable deployment are now the largest
remaining constraints.

## What Changes

- Add one privately operated, single-household hosted Nemlig Assistant service
  with an authenticated Streamable HTTP MCP endpoint in an EU region.
- Authenticate only the owner through standards-based OAuth/OIDC and bind that
  identity to exactly one configured Nemlig account; no account selector is
  accepted from tool input.
- Move the Nemlig credential and hosted service secrets into a managed secret
  store, while keeping them out of model-visible content, logs, Git, and client
  configuration.
- Preserve the existing tool contracts, exact prepare/approve/apply boundary,
  mutation serialization, revalidation, single-use behavior, readback, and the
  absence of checkout, payment, order, and delivery-slot tools.
- Retain the local CLI and stdio MCP server. Run the hosted and tunnel paths in
  parallel for a bounded validation period, then retire the tunnel only after
  an explicit cutover decision.
- Add automated verified deployment, health and readiness checks, privacy-safe
  audit events, alerting, rollback, credential rotation, and service shutdown
  procedures.
- Store hosted plan snapshots durably and owner-bound. Pending proposals may
  fail closed on restart and require fresh preparation; no uncertain mutation
  is retried automatically.

### Goal

Keep the private Nemlig ChatGPT app available without the owner's Mac while
preserving the current single-account safety contract and producing auditable
evidence for every deployment and basket mutation boundary.

### Non-goals

- Multi-household or public access, self-service registration, billing, or
  general tenant administration.
- Horizontal scaling, distributed proposal execution, or a provider abstraction
  before measured demand requires them.
- Recipe generation, checkout, ordering, payment, delivery-slot mutation, or
  autonomous basket changes.
- Public npm publication or removal of the local CLI and stdio interfaces.
- Retiring the tunnel before the hosted path passes the cutover criteria.

### Acceptance Criteria

- The owner can connect ChatGPT to the hosted MCP endpoint through OAuth/OIDC
  and use read-only tools while the Mac and local tunnel are off.
- An unapproved identity, expired or revoked authorization, and any tool-supplied
  identity or account selector are rejected without contacting Nemlig.
- Nemlig credentials and service secrets are held only in approved hosted secret
  storage and never appear in tool results, logs, committed files, or client
  configuration.
- Existing tool schemas and safety behavior remain compatible, and every basket
  mutation still requires explicit approval of one unchanged exact proposal.
- Deployment from an approved commit is automated, health-checked, observable,
  and rollback-tested without replacing the last healthy release on failure.
- Credential rotation, authorization revocation, service shutdown, and tunnel
  fallback are demonstrated before an explicit cutover retires the tunnel.

## Capabilities

### New Capabilities

- `nemlig-hosted-service`: Single-household hosted runtime, owner authentication,
  secret handling, deployment evidence, observability, rollback, and cutover.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Replace the tunnel-only access and local-secret
  boundary with an owner-authenticated hosted option and bounded dual-run cutover.
- `nemlig-mcp`: Add authenticated Streamable HTTP transport without changing the
  local stdio interface or model-visible tool contracts.
- `nemlig-basket-proposals`: Bind hosted proposals to the authenticated owner and
  session and define fail-closed restart behavior while preserving exact approval.
- `nemlig-guided-shopping`: Add durable owner-bound hosted plan snapshots while
  retaining the existing local snapshot behavior.

## Impact

- Affected app areas include MCP server construction and transport, credential
  loading, session ownership, proposal binding, snapshot storage, configuration,
  tests, and operator documentation under `apps/nemlig-assistant/`.
- New deployment and verification configuration will be required for the chosen
  host, OAuth/OIDC provider, managed secret storage, persistent snapshot storage,
  monitoring, and alerts.
- The ChatGPT developer app will gain a hosted OAuth connection during validation;
  the existing Secure MCP Tunnel remains available until explicit cutover.
- Hosting and identity services may incur ongoing cost and create external
  resources; their exact provider, region, cost ceiling, and creation remain
  implementation gates rather than being authorized by this proposal.
