## Why

The private ChatGPT app currently depends on the owner's Mac, login session,
local MCP process, and Secure MCP Tunnel. Before choosing a permanent host, the
same tunnel can carry a loopback HTTP MCP endpoint whose callers authenticate
through Auth0. This provides an immediate owner-authentication improvement and
proves the reusable HTTP/OAuth boundary without moving Nemlig credentials off
the Mac or creating billable hosting.

## What Changes

- Add an Auth0-authenticated Streamable HTTP MCP endpoint on loopback and carry
  it through the existing Secure MCP Tunnel as the first delivery milestone.
- Reuse that HTTP/OAuth core later in one privately operated, single-household
  hosted Nemlig Assistant service in an approved EU region.
- Authenticate only the owner through standards-based OAuth/OIDC and bind that
  identity to exactly one configured Nemlig account; no account selector is
  accepted from tool input.
- Move the Nemlig credential and hosted service secrets into a managed secret
  store, while keeping them out of model-visible content, logs, Git, and client
  configuration.
- Preserve the existing tool contracts, exact prepare/approve/apply boundary,
  mutation serialization, revalidation, single-use behavior, readback, and the
  absence of checkout, payment, order, and delivery-slot tools.
- Retain the local CLI and stdio MCP server. Replace the current tunnel target
  with the authenticated loopback HTTP endpoint after a bounded comparison,
  then discuss hosting separately and retire the tunnel only after a later
  explicit hosted cutover decision.
- Add automated verified deployment, health and readiness checks, privacy-safe
  audit events, alerting, rollback, credential rotation, and service shutdown
  procedures.
- Store hosted plan snapshots durably and owner-bound. Pending proposals may
  fail closed on restart and require fresh preparation; no uncertain mutation
  is retried automatically.

### Goal

First move ChatGPT caller authentication to Auth0 without hosting Nemlig
credentials, then make the private app independent of the owner's Mac through a
separately approved host while preserving the single-account safety contract.

### Non-goals

- Multi-household or public access, self-service registration, billing, or
  general tenant administration.
- Horizontal scaling, distributed proposal execution, or a provider abstraction
  before measured demand requires them.
- Recipe generation, checkout, ordering, payment, delivery-slot mutation, or
  autonomous basket changes.
- Public npm publication or removal of the local CLI and stdio interfaces.
- Retiring the tunnel before the hosted path passes the cutover criteria.
- Creating or selecting a billable host during the Auth0-secured tunnel
  milestone.

### Acceptance Criteria

- The owner can connect ChatGPT through the existing tunnel and complete the
  Auth0 OAuth/OIDC flow before any MCP tool is dispatched.
- The authenticated tunnel uses the same HTTP/OAuth core intended for later
  hosting while Nemlig credentials, sessions, snapshots, and safety state remain
  local.
- After a separate hosting decision, the owner can connect ChatGPT to the hosted
  MCP endpoint and use read-only tools while the Mac and local tunnel are off.
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
- The tunnel profile and local supervision will change from a stdio child process
  to a loopback HTTP MCP target. Auth0 configuration and synthetic authorization
  verification are required now; hosting resources are not.
- New deployment configuration will be required later for the chosen host,
  managed secret storage, persistent snapshot storage, monitoring, and alerts.
- The ChatGPT developer app will first gain OAuth through its existing tunnel;
  a separate hosted connection remains a later validation and cutover step.
- Hosting and identity services may incur ongoing cost and create external
  resources; their exact provider, region, cost ceiling, and creation remain
  implementation gates rather than being authorized by this proposal.

## Closure

Superseded on 2026-09-01 by the implemented Cloudflare hosting and
production-only tunnel-retirement changes. This change is archived without
syncing its deltas because its tunnel-first migration, generic host staging,
durable snapshot, and fallback requirements no longer describe the accepted
production architecture. Unchecked tasks remain as historical evidence of work
that was replaced rather than completed.
