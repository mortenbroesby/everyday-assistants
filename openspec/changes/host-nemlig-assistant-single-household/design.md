## Context

See `proposal.md` for motivation. The current process is a single Node 22 stdio
MCP server behind Secure MCP Tunnel. It owns one `NemligClient`, loads one local
credential, keeps sessions and basket proposals in memory, serializes mutations
with one process-local mutex, and writes immutable plan snapshots to owner-only
local files.

The first milestone preserves those properties on the Mac while adding a
loopback Streamable HTTP transport and Auth0 owner authentication through Secure
MCP Tunnel. The later hosted design reuses that HTTP/OAuth core and adds managed
secrets, durable snapshots, and deployment operations. The current provider
client has no supported public Nemlig OAuth flow; both runtimes must continue to
protect one server-side household credential. Hosting and hosted-secret resources
are not created until their later gates are accepted.

## Goals / Non-Goals

**Goals:**

- Reuse one tool-registration core across local stdio and authenticated
  Streamable HTTP, first on loopback through the tunnel and later in hosting.
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

### Prove Auth0 through the existing tunnel before hosting

Run the reusable Streamable HTTP entry point on loopback and configure
`tunnel-client` with its local MCP URL. ChatGPT reaches the OpenAI-hosted tunnel
endpoint, OAuth discovery and MCP traffic traverse the tunnel, and the local
server validates Auth0 access tokens before dispatch. The Auth0 authorization
server remains publicly reachable; no inbound listener or public proxy is added
to the Mac.

The tunnel runtime API key and Auth0 authorization are complementary rather than
duplicates. The runtime key authenticates `tunnel-client` to OpenAI's control
plane; Auth0 authenticates and authorizes the human caller to this MCP resource.
Nemlig credentials, cookies, proposals, snapshots, and mutation state remain in
the existing local boundary for this milestone.

Do not add a tunnel-specific authentication proxy or a second tool server. The
same HTTP adapter, protected-resource metadata, token validation, owner context,
and contract tests must be deployable later behind a hosting provider's TLS
endpoint. Only the loopback address, process supervision, and tunnel profile are
temporary. OpenAI's [Secure MCP Tunnel OAuth
documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#oauth)
confirms that OAuth discovery metadata can traverse the tunnel path.

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

The identity decision remains **Auth0 Europe**. Render in Frankfurt remains the
costed hosting baseline, but the host decision is reopened for comparison after
the authenticated tunnel milestone. No hosting endpoint, secret, or billable
resource has been created.

The owner approved the Auth0 Europe tenant and its USD 0 Free-plan boundary on
2026-08-31. The earlier Render baseline and USD 10/month ceiling are retained as
comparison evidence, not as current authorization to create hosting. Host choice,
production identity binding, Nemlig credential provisioning, and cutover remain
separately gated.

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

### Reuse the official SDK over two transports and two deployments

Extract the current MCP construction into a transport-neutral server factory.
Keep the existing stdio entry point and add a separate HTTP entry point using the
installed MCP SDK's Streamable HTTP transport behind a minimal Node HTTP adapter.
During the tunnel milestone it binds only to loopback and the tunnel supplies the
remote path. Later the host terminates TLS. In either deployment the service
validates permitted origins and accepts MCP traffic only on the configured
endpoint.

Contract tests enumerate both transports from the same revision and compare tool
names, resource URIs, schemas, annotations, and server instructions. Health and
OAuth metadata endpoints are HTTP-only and excluded from that equality check.

### Delegate OAuth/OIDC and validate one owner in both HTTP deployments

Use a standards-based hosted authorization provider rather than implementing an
authorization server. The provider must interoperate with ChatGPT's remote MCP
flow, authorization code plus PKCE, protected-resource discovery, and refresh or
offline access. Complete that compatibility proof through the credential-free
tunnel before provisioning any hosted Nemlig credential.

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

### Cut over each boundary after a bounded comparison

Keep the current stdio-target tunnel available while the authenticated HTTP-target
tunnel is proven, then switch the private app only after OAuth discovery,
authorization, revocation, contract parity, and read-only behavior pass. Later,
keep that authenticated tunnel available while a hosted app is evaluated. The
owner explicitly decides each switch and whether to retire the tunnel. Hosted
rollback restores the authenticated tunnel or the last healthy hosted image.

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

1. Keep Auth0 on its verified Free plan and leave hosting selection deferred.
2. Refactor the MCP factory and add the loopback authenticated HTTP entry point
   behind local compatibility and synthetic authorization tests.
3. Point the existing tunnel at the loopback HTTP endpoint and prove ChatGPT
   discovery, PKCE, refresh, owner authorization, revocation, and read-only use.
4. Make the explicit switch from the stdio-target tunnel only after that proof;
   preserve the stdio entry point and local Nemlig credential boundary.
5. Compare and approve a host, region, recurring cost, secret store, and storage
   boundary separately.
6. Deploy the same verified HTTP/OAuth core, configure a separate hosted ChatGPT
   app, and run read-only acceptance with the Mac and tunnel off.
7. Exercise hosted restart, rotation, failed deployment, rollback, and shutdown.
   Retire the tunnel only after a separate explicit hosted cutover decision.

Rollback before cutover leaves or restores the tunnel as the ChatGPT connection.
Rollback after cutover restores the recorded healthy hosted image; if safety is
uncertain, shut down hosted ingress, revoke authorization, inspect the Nemlig
basket, and never retry an uncertain proposal.

## Open Questions

- What bounded dual-run duration gives the owner enough confidence before
  cutover?
