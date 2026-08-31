## Context

See `proposal.md` for motivation. The current process is a single Node 22 stdio
MCP server behind Secure MCP Tunnel. It owns one `NemligClient`, loads one local
credential, keeps sessions and basket proposals in memory, serializes mutations
with one process-local mutex, and writes immutable plan snapshots to owner-only
local files.

The hosted design must preserve those useful single-household properties while
adding HTTPS transport, owner authentication, managed secrets, durable snapshots,
and deployment operations. The current provider client has no supported public
Nemlig OAuth flow; the service must continue to protect one server-side household
credential. External hosting, identity, and secret resources may incur cost and
are not created until their gates are accepted.

## Goals / Non-Goals

**Goals:**

- Reuse one tool-registration core across local stdio and hosted Streamable HTTP.
- Keep one authenticated owner, one Nemlig account, one active service instance,
  and one mutation lock for the initial hosted release.
- Make restarts and failed deployments safe: sessions recover, pending proposals
  disappear and require fresh review, and uncertain writes are never retried.
- Produce exact-revision deployment, health, rollback, revocation, and cutover
  evidence that the owner can inspect.

**Non-Goals:**

- A reusable cloud abstraction, home-grown OAuth server, multi-tenant data model,
  distributed lock, or horizontally scaled proposal service.
- Persisting pending proposals merely to survive restarts; fail-closed loss is
  simpler and preserves the safety contract.
- Changing the Nemlig client, discovery behavior, tool contracts, or supported
  basket operations except where transport context and storage are required.

## Decisions

### Use one always-on EU Node container

Package the existing Node 22 runtime as one continuously running container with
platform-managed TLS and a single active replica. Select a host only after a
short comparison confirms EU execution, health checks, managed secrets, durable
snapshot storage, revision evidence, rollback, alerts, and an accepted cost
ceiling.

This is a smaller adaptation than a function-per-request or edge runtime because
the existing Nemlig session, cookie jar, proposal map, and mutex are intentionally
process-local. Vercel Functions or Cloudflare Workers remain future alternatives
if measured availability or scale justifies externalizing those states.

Do not introduce a provider interface. Once the host is selected, use its direct
deployment and operations primitives and keep provider-specific configuration at
the repository boundary.

#### Feasibility record (2026-08-31)

The maintained client signs in with the household email and password, retains
Nemlig session cookies, and calls the same web endpoints used by the existing
local assistant (`apps/nemlig-assistant/src/config.ts` and `client.ts`). A review
of Nemlig's public site did not locate a supported developer API, an automation
policy, or current terms that expressly permit an unattended third-party host to
store account credentials and automate those endpoints. Nemlig's [published
privacy notice](https://spil.nemlig.com/aarhus/About) confirms that account and
purchase activity is personal data, but the page identifies itself as a 2020
version and is not sufficient permission for this deployment.

This is an unresolved policy and contract risk, not a legal conclusion. The
credential-free transport and OAuth staging proof may proceed after provider
approval, but production Nemlig credentials remain blocked until the owner has
reviewed the then-current customer terms and either obtained acceptable written
clarification from Nemlig or explicitly accepted the remaining risk.

Stop and retain the tunnel if any of the following occurs:

- current Nemlig terms or written guidance prohibit hosted credential use or
  automated access;
- login requires bypassing MFA, CAPTCHA, anti-bot controls, or another technical
  safeguard, or the web interface stops supporting the existing client safely;
- the credential-free OAuth proof fails ChatGPT discovery, PKCE, refresh,
  audience, subject, scope, or revocation checks;
- the selected services cannot keep execution and identity data in their
  approved EU regions, enforce one active replica, protect secrets and snapshots,
  or remain within the approved recurring-cost ceiling;
- implementation would expose credentials, cookies, authorization tokens,
  shopping content, or owner identity in source, images, logs, or model output.

#### Provider decision record (2026-08-31)

The smallest qualifying pair is **Render in Frankfurt plus an Auth0 Europe
tenant**. No provider account, endpoint, secret, or billable resource was created
while making this recommendation.

The owner approved this pair, the Frankfurt and Europe regions, the USD 10/month
before-tax ceiling, the recorded security boundary, and creation of
credential-free staging resources on 2026-08-31. Production identity binding,
Nemlig credential provisioning, and cutover remain separately gated.

| Candidate | Fit | Decision |
| --- | --- | --- |
| [Render](https://render.com/docs/web-services) Frankfurt | A paid Docker web service is always on; managed TLS/secrets, health checks, alerts, rollbacks, and an encrypted persistent disk cover the required operations. A disk constrains the service to one instance and has daily snapshots, at the accepted cost of brief deploy downtime. The 512 MB service is [$7/month](https://render.com/articles/render-vs-railway) and 1 GB of disk is [$0.25/month](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses). | Recommend. Pin one instance and one 1 GB disk; use direct Render configuration. |
| [Fly.io](https://fly.io/docs/reference/regions/) Frankfurt or Amsterdam | Machines, volumes, secrets, health checks, and EU regions qualify, but volume locality and machine/deployment controls create more operator work and usage-based cost variability for no single-household benefit. | Feasible fallback if the Render staging proof fails. |
| [Auth0](https://auth0.com/docs/get-started/applications/dynamic-client-registration) Europe | Open DCR supports authorization code, PKCE, refresh tokens, explicit API grants, and access controls. The [Europe locality](https://auth0.com/docs/get-started/auth0-overview/create-tenants) controls where tenant data is hosted. The Free plan is [$0/month](https://auth0.com/pricing?pm=true) for this one-owner use. | Recommend. Use one EU tenant, one owner subject, one audience, and one least-privilege scope. |
| [ZITADEL](https://zitadel.com/docs/guides/integrate/dynamic-client-registration) | DCR explicitly supports MCP, PKCE, and refresh tokens, but its documented audience semantics require extra `client_id` or `azp` validation and it does not yet expose OAuth authorization-server metadata separately from OIDC discovery. | Feasible fallback; additional validation is unnecessary while Auth0 qualifies. |

The recommended staging ceiling is **USD 10/month before tax**, covering the
$7.25 documented base with limited headroom for small usage overages. Auth0 must
remain on its Free plan. Crossing the ceiling pauses deployment for a new owner
decision; no automatic upgrade or scaling is allowed.

The approved security boundary will be one Render service and disk in Frankfurt,
one Auth0 tenant in Europe, one immutable Auth0 subject, one MCP audience and
scope, one managed Nemlig secret, and one active service replica. Render may see
encrypted secret values at runtime and encrypted snapshots at rest; Auth0 sees
only authentication identity and authorization metadata. Neither provider may
receive prompt text, basket contents, full plans, proposal reviews, Nemlig
cookies, or Nemlig credentials outside the Render secret boundary.

### Reuse the official SDK over two transports

Extract the current MCP construction into a transport-neutral server factory.
Keep the existing stdio entry point and add a separate hosted entry point using
the installed MCP SDK's Streamable HTTP transport behind a minimal Node HTTP
adapter. The host terminates TLS; the service validates permitted origins and
accepts MCP traffic only on the configured endpoint.

Contract tests enumerate both transports from the same revision and compare tool
names, resource URIs, schemas, annotations, and server instructions. Health and
OAuth metadata endpoints are HTTP-only and excluded from that equality check.

### Delegate OAuth/OIDC and validate one owner

Use a standards-based hosted authorization provider rather than implementing an
authorization server. The provider must interoperate with ChatGPT's remote MCP
flow, authorization code plus PKCE, protected-resource discovery, and refresh or
offline access. Complete a staging compatibility proof before provisioning the
Nemlig credential.

The MCP service validates issuer, audience, signature, expiry, and required scope,
then compares the immutable subject to one configured owner identifier. Tool
arguments never select identity or account. The approved issuer, audience,
subject, and storage references are server configuration and are never returned
to the model. Revocation is tested through the provider and the service's token
validation path.

### Keep volatile safety state volatile

Maintain one in-memory Nemlig session, proposal map, completed-result cache, and
mutation mutex inside the single hosted process. Bind a hosted proposal to the
validated owner and MCP session identifier. A restart loses pending and completed
proposal records, so later apply attempts fail as not found and must be prepared
again; no request reconstructs or retries a mutation.

This deliberately accepts interrupted pending reviews in exchange for avoiding a
database and distributed transaction design. More than one active replica is
prohibited until a later specification adds shared proposal state and distributed
serialization.

### Split credentials, snapshots, and audit by sensitivity

- The Nemlig username/password and service signing material live only in the
  host's managed secret store and enter the process through secret references.
- Guided-plan snapshots use one small storage contract with two real
  implementations: existing owner-only files for local execution and the chosen
  host's durable object or volume storage for hosted execution. Hosted object keys
  are opaque IDs under the configured owner; unauthorized and missing reads are
  indistinguishable.
- Platform logs receive only bounded event classes, timestamps, deployed revision,
  operation type, result class, and generated non-secret correlation IDs. Prompts,
  credentials, cookies, tokens, full plans, proposals, and baskets are excluded.

No general persistence layer is added. Snapshot storage is the only durable
application data required by the current feature set.

### Deploy an exact tested revision with manual production promotion

CI builds the container from one commit after `pnpm verify`, contract tests,
secret scans, and synthetic hosted-flow tests. A staging deployment must pass
OAuth discovery, authenticated tool enumeration, health, and read-only synthetic
checks before the same immutable image is eligible for production promotion.

Production promotion is explicit while the service remains alpha. Activation
records the commit and image digest, runs post-deployment health checks, and keeps
the prior healthy image available for rollback. No deployment test calls a live
basket mutation.

### Cut over after a bounded dual run

Keep the tunnel unchanged while the hosted app is connected separately. Compare
source revision, tool contract, read-only behavior, authentication, revocation,
restart behavior, and one optional separately approved exact proposal flow. The
owner explicitly decides whether to switch the ChatGPT app and retire the tunnel.
Rollback before retirement points ChatGPT back to the tunnel; rollback afterward
restores the last healthy hosted image or executes service shutdown.

## Risks / Trade-offs

- **Nemlig or provider policy does not permit hosted credential use** -> Stop at
  the feasibility gate and retain the tunnel.
- **The chosen OAuth provider does not interoperate with ChatGPT refresh and
  discovery requirements** -> Prove the complete staging authorization cycle
  before storing Nemlig credentials or deploying production.
- **Single-instance outage interrupts access and pending proposals** -> Use host
  restart and rollback; fail pending proposals closed and require fresh review.
- **A platform accidentally starts multiple active replicas** -> Pin replica
  count to one and add a deployment assertion; require a new distributed-state
  design before scaling.
- **Hosted credential compromise has greater reach than a local compromise** ->
  Use managed secrets, least-privilege operator access, redacted logs, rotation,
  revocation, alerts, and a tested shutdown path.
- **Provider lock-in** -> Accept the small amount of deployment configuration;
  containerized runtime and behavior contracts remain portable without adding a
  speculative provider abstraction.
- **Durable snapshot storage reveals personal shopping intent** -> Store only the
  existing structured snapshot schema, bind access to the owner, encrypt through
  the platform, avoid logs, and support deletion during service shutdown.

## Migration Plan

1. Complete the policy, provider, region, identity, and cost decision record.
2. Refactor the MCP factory and snapshot store behind local compatibility tests;
   local stdio and the tunnel remain the active production path.
3. Add the authenticated HTTP entry point and prove OAuth plus contract parity
   locally and in a credential-free staging deployment.
4. Provision production identity, secret, snapshot, monitoring, and deployment
   resources only after the owner approves the selected external resources and
   recurring cost.
5. Deploy the exact verified image, configure the private hosted ChatGPT app, and
   run read-only acceptance with the Mac and tunnel off.
6. Exercise restart, revocation, rotation, failed deployment, rollback, and
   shutdown. Optionally exercise one separately approved exact basket proposal.
7. Run both paths for a bounded alpha period. Retire and revoke the tunnel only
   after a separate explicit cutover decision.

Rollback before cutover leaves or restores the tunnel as the ChatGPT connection.
Rollback after cutover restores the recorded healthy hosted image; if safety is
uncertain, shut down hosted ingress, revoke authorization, inspect the Nemlig
basket, and never retry an uncertain proposal.

## Open Questions

- What bounded dual-run duration gives the owner enough confidence before
  cutover?
