# Cloudflare hosting assessment for Nemlig MCP

Status: production enabled for controlled read-only acceptance; authenticated acceptance pending

Evidence checked: 2026-09-01

Production resources: one Worker, two fixed Durable Object classes, one `lite`
Container application capped at one instance, and the custom hostname
`nemlig-mcp.broesby.dk`

## Recommendation

Use one Cloudflare Worker in front of one deterministic, EU-jurisdiction,
container-enabled SQLite Durable Object. That object owns the safety state and
one sleeping Nemlig MCP Container. A second fixed EU SQLite Durable Object stores
only immutable plan snapshots because calling back into the in-flight Container
controller would create a fragile re-entrancy dependency. Configure
`max_instances = 1`, route to fixed object IDs, and do not use `getRandom` or any
dynamic instance-ID path.

```text
ChatGPT / MCP client
        |
        v
Worker: MCP_ENABLED -> request validation -> Auth0
        |
        v
one fixed EU container-enabled Durable Object
  - exact per-owner rate windows
  - daily normal/expensive counters
  - circuit-breaker state
        |
        v
one EU lite Container, asleep when idle
        |
        v
Nemlig and, only for the feature-request tool, GitHub

Container -- internal egress --> one fixed EU plan-storage Durable Object
```

This is the smallest safe migration. A Container preserves the existing Node 22
HTTP process, Streamable HTTP/SSE session state, filesystem-capable runtime, and
GitHub CLI child process. A direct Worker would require transport, process, and
persistence changes before it could preserve all current tools.

The implementation checkpoint added and locally measured the minimal image. It
is about **97 MB**, starts in about **4–5 seconds** without an artificial CPU
cap, and used about **34–43 MiB** steady memory in the synthetic Auth0 HTTP MCP
smoke test. It passed health and anonymous-auth rejection at a 256 MiB memory
limit without OOM. A local hard 1/16-vCPU emulation made startup take about two
minutes, so Cloudflare cold-start behavior remains an availability risk to test
before cutover; it does not threaten the memory/cost bound. Wrangler's production
dry run built the same `lite` image and confirmed the fixed EU bindings without
uploading or creating resources.

## Current application assessment

| Area | Evidence | Hosting consequence |
| --- | --- | --- |
| Runtime | [`package.json`](../apps/nemlig-assistant/package.json) requires Node `>=22.23.1 <23`; [`tsdown.config.ts`](../apps/nemlig-assistant/tsdown.config.ts) emits Node 22 ESM bundles. | A Node Container is a direct runtime match. Workers Node compatibility is incomplete. |
| Entry points | The package exposes CLI, stdio MCP, and HTTP MCP entry points. [`http.ts`](../apps/nemlig-assistant/src/http.ts) calls `app.listen`. | Host only the existing HTTP MCP entry point. It needs a configurable internal bind address instead of its current fixed `127.0.0.1`. |
| Process state | [`http.ts`](../apps/nemlig-assistant/src/http.ts) stores MCP transports by session ID in a `Map`. [`client.ts`](../apps/nemlig-assistant/src/client.ts) stores cookies, token, user ID, product metadata, and timeslot in memory. | One fixed Container preserves state while awake. Sleep/restart drops sessions and login cache; the client must reinitialize and the app can log in again. |
| Proposal safety | [`proposals.ts`](../apps/nemlig-assistant/src/proposals.ts) stores short-lived proposals and completed/invalid/indeterminate results in memory. Mutation application is mutex-protected per MCP server, and indeterminate outcomes explicitly say not to retry. | Proposal state is intentionally restart-discardable. A restart fails closed because an approval ID is no longer found. Preserve the no-retry behavior. Serialize expensive/mutation admission globally in the fixed object to avoid concurrent sessions bypassing the per-server mutex. |
| Durable files | [`plans.ts`](../apps/nemlig-assistant/src/plans.ts) atomically creates and later reads immutable shopping-plan JSON files under `NEMLIG_CONFIG_DIR/plans` or `~/.nemlig-shopper/plans`. It already accepts a `PlanSnapshotStorage` implementation. | Saved plans genuinely need restart persistence. Container disks and Worker `/tmp` are ephemeral. The hosted profile reuses the storage seam and routes snapshots through an internal Container outbound handler to one fixed storage-only SQLite Durable Object; no R2 bucket is needed. |
| Credentials | [`config.ts`](../apps/nemlig-assistant/src/config.ts) accepts `NEMLIG_USERNAME` and `NEMLIG_PASSWORD` before its local-file fallback. | Inject production credentials as secrets; do not copy the local credentials file. Development must have no real mutation credentials by default. |
| Child processes | [`feature-request.ts`](../apps/nemlig-assistant/src/feature-request.ts) executes `gh` with a 30-second timeout and bounded lookup/create/reconciliation. | Containers can preserve this tool by including `gh` and a narrowly scoped GitHub credential. Workers expose only a non-functional `node:child_process` stub, so Workers-native would need a GitHub API rewrite. |
| Browser automation | There is no runtime browser-automation dependency. | No browser runtime is needed in the image. |
| Transport | [`http.ts`](../apps/nemlig-assistant/src/http.ts) uses MCP Streamable HTTP and supports its event-stream response path. It has no WebSocket endpoint. | Proxy HTTP streaming unchanged through the fixed object and Container. Test reconnect after sleep. |
| Connections | Runtime code uses HTTPS `fetch`; it does not manage raw persistent TCP connections. | No special TCP service is required. |
| Authentication | [`auth0.ts`](../apps/nemlig-assistant/src/auth0.ts) verifies Auth0 RS256 JWT issuer, audience, owner subject, and scope. JWKS and metadata are cached only in process memory. Discovery currently has no explicit timeout. | Reuse the verifier in the Worker before the fixed object/Container. Bound discovery/JWKS requests. Keeping defense-in-depth verification in the Container is acceptable, but unauthenticated traffic must never wake it. |
| External calls | [`client.ts`](../apps/nemlig-assistant/src/client.ts) calls Nemlig with a 30-second timeout. Reads make at most four total attempts and do not retry HTTP/parse failures; mutations disable retry and perform readback. Planning/search loops and concurrency are bounded. | Preserve these bounds. Add an overall gateway/backend deadline and an explicit timeout for Auth0 discovery/JWKS. There is no queue, recursive retry, scheduled keep-alive, or regenerating work. |

### State classification

| State | Class | Reason |
| --- | --- | --- |
| MCP transport/session IDs | Restart-discardable | The client can establish a new MCP session. |
| Nemlig cookies, access token, user ID, timestamps, product-name cache, timeslot | Restart-discardable | They can be recovered by logging in and reading Nemlig again. |
| Auth0 metadata and JWKS cache | Restart-discardable | They can be fetched again with bounded calls. |
| Prepared, completed, invalid, or indeterminate basket proposals | Restart-discardable and fail-closed | Losing an approval ID prevents application; indeterminate operations remain non-retryable. |
| Saved shopping-plan snapshots | Restart-required | `save` followed by a later `load` is a shipped feature contract. |
| Rate windows, daily counts, breaker flag/time/reason | Restart-required safety state | Losing them could reopen a tripped backend or undercount usage. |
| Nemlig account, basket, and favorites | External | Nemlig remains the system of record. |
| Auth0 user/tenant configuration | External | Auth0 remains the identity provider. |
| GitHub issues | External | Created only by an explicit feature-request tool call. |

## Platform comparison

### Direct Workers

Not recommended for the first migration. Current Workers can run many Node APIs,
but their filesystem is request-scoped, `node:child_process` is a throwing stub,
and a normal Node listener is not a drop-in Worker entry point. Preserving the
current MCP would require:

- adapting the MCP server to a Worker-native fetch/Streamable HTTP handler;
- replacing the `gh` child process with GitHub API calls;
- moving saved-plan persistence to Durable Object storage; and
- proving that all transitive Node dependencies and long-lived MCP streaming
  behavior work within Worker CPU and memory limits.

That may become attractive later, but it is not the smallest first move.

### Workers plus Durable Objects, without a Container

More practical than a stateless Worker because a Durable Object can own exact
global quotas, sessions, and saved plans. It still requires the same transport
and child-process rewrites. It does not materially reduce the expected bill
below the Workers Paid minimum for this traffic.

### Worker plus one Container

Recommended. It preserves the application process and confines the migration to
a thin gateway, a fixed safety/storage object, a minimal image, configurable
internal binding, and the existing snapshot-storage seam. Cloudflare Containers
can call Worker bindings through outbound handlers, including their own Durable
Object state, so plan persistence does not require another storage product.

## Production resources

The owner reviewed and separately approved creation of:

1. One active Workers Paid account/plan.
2. One Worker script, `nemlig-mcp-cloudflare-production`, with the custom
   hostname `nemlig-mcp.broesby.dk` and a workers.dev fallback.
3. One EU-jurisdiction SQLite Durable Object namespace whose class is also the
   Container controller; application code always uses one fixed production ID.
4. One EU-jurisdiction SQLite Durable Object namespace with one fixed ID for
   immutable plan snapshots. It has no Container or public route.
5. One Container application/image with `instance_type = "lite"`,
   `max_instances = 1`, EU placement, and a 10-minute idle sleep timeout.
6. Worker secrets for actual credentials only: Nemlig credentials and any
   required Auth0/GitHub secret. Thresholds and `MCP_ENABLED` are plain config.
7. Two recommended informational account budget alerts: USD 10 warning and USD
   20 urgent. These remain an account-dashboard step and are not application
   enforcement.

Do not add R2, D1, KV, Queues, Workflows, load balancing, generic autoscaling, or
staging infrastructure for this family-only service.

### Data held by Cloudflare

- The Container-controller Durable Object stores daily/rate counters, breaker
  status, and trip metadata. The separate storage-only Durable Object stores
  saved shopping-plan input snapshots. Place both in EU jurisdiction.
- Worker secrets store Nemlig credentials and any narrowly scoped provider
  credential required by the deployed tools.
- The Container holds only ephemeral MCP sessions, Nemlig cookies/tokens, and
  working data while awake. Its disk is not a persistence boundary.
- Cloudflare logs receive only structured event names, counts, status, revision,
  and non-sensitive error classes. Never log tokens, credentials, cookies,
  prompts, plan contents, basket contents, or Nemlig product data.
- The Worker executes at Cloudflare's edge and sees request/token data in transit,
  but it should not persist those values.

## Safety contract for implementation

- The first meaningful MCP branch is exactly `env.MCP_ENABLED === "true"`.
  Disabled requests return 503 before auth, Durable Object, Container, or Nemlig.
- Authentication and owner/scope checks happen before the Durable Object. Invalid
  Internet traffic cannot wake the Container.
- The fixed object atomically admits each useful operation against exact
  per-owner rate windows and daily normal/expensive quotas before Container use.
  Do not use Cloudflare's permissive, per-location Rate Limiting binding for this
  strict global accounting.
- Defaults remain 5,000 useful operations/day, 500 expensive operations/day,
  60 normal/minute/owner, and 10 expensive/minute/owner until an MCP session
  measurement justifies changing them.
- Exceeding either daily quota opens the breaker. Later useful operations fail
  closed without touching the Container. Store trip time and an enumerated
  reason. Reset on the next UTC usage period or through an authenticated manual
  reset.
- Configure a thin Worker CPU limit and the lowest measured subrequest limit that
  supports Auth0 plus the fixed admission and backend calls. Configure an overall
  backend timeout.
- Only the constant production object ID may start the Container. Set
  `max_instances = 1`; do not call `getRandom`, derive IDs from users/requests, or
  expose infrastructure-provisioning operations.
- Use EU jurisdiction for both fixed objects and Container placement.

## Expected cost

Cloudflare's current Workers Paid minimum is **USD 5/month per account**. It
includes 10 million Worker requests, 30 million Worker CPU milliseconds, 1
million Durable Object requests, and the initial Container allowances. At the
proposed 5,000-operation daily ceiling, useful family traffic is only about
150,000 Worker/object operations per 30-day month, before minor protocol
overhead, and remains within the request allowances.

The `lite` Container has 0.25 GiB memory, 1/16 vCPU, and 2 GB disk. The included
25 GiB-hours of memory and 200 GB-hours of disk each cover about **100 awake
instance-hours/month** at that size. With a 10-minute idle sleep, that is roughly
600 fully separated wake periods/month, or 20/day, before memory/disk overage.
Normal family use should therefore remain at the **USD 5 baseline** if the lite
image fits and sleeps normally.

For scale, a lite instance accidentally awake for all 730 hours of a month would
add about USD 1.42 memory plus USD 0.32 disk overage. CPU is billed by actual CPU
use; full saturation for the entire month would add about USD 2.84 after the
included allowance. These figures exclude request, egress, and other account
usage, but show why one lite instance is materially bounded. A `basic` instance
left awake would already put the idle memory/disk estimate near USD 12/month
including the baseline, so it does not meet the USD 5 target.

Budget alerts are delayed, informational, account-wide usage alerts—not a hard
cap or kill switch. Cloudflare documents that recurring charges such as the USD 5
plan fee are not included in the alert amount. A USD 10 usage alert can therefore
correspond to roughly USD 15 total before tax and other fixed charges.

## Residual cost and reliability risks

- Requests rejected before the Durable Object still consume Worker request/CPU
  allowance. The manual switch prevents backend cost, not all Worker billing.
- A compromised valid owner token could consume the configured quotas; exact
  rate limits and the breaker bound the damage but do not make cost zero.
- A Container that fails to sleep increases memory/disk duration. `max_instances
  = 1`, wake logging, and the manual switch are the primary controls.
- Falling back from `lite` to `basic`, high CPU, excessive Auth0/JWKS fetches,
  outbound Nemlig/GitHub traffic, logs, or egress can add cost.
- Cloudflare budget alerts may arrive after usage and do not stop services.
- The Worker Paid minimum is per account. Other workloads in the same account
  share billing and alert totals.
- Container cold starts are commonly seconds and the runtime is not guaranteed;
  MCP sessions can be interrupted and must reconnect. Availability is explicitly
  secondary to bounded cost here.
- Auth0, GitHub, domain registration, and Nemlig-side costs or limits are outside
  the Cloudflare estimate.

The failure preference remains: make the MCP unavailable before allowing
infrastructure usage to grow.

## Disable, remove, and manual steps

Emergency disablement is a plain Cloudflare configuration change setting
`MCP_ENABLED=false`, followed by deployment of the Worker configuration. It must
not require a code change or secret rotation.

Full removal is:

1. Disable the MCP and verify a 503 without a Container wake.
2. Remove the Worker route/custom hostname.
3. Export nothing unless saved plans are deliberately retained; otherwise invoke
   the authenticated purge path to delete fixed-object storage.
4. Delete the Worker/Container deployment, Container instances/application and
   image, both Durable Object data/namespaces, and Worker secrets.
5. Remove related DNS only if it was created for this deployment, then cancel the
   Workers Paid plan if no other account workload needs it.

Unavoidable manual steps will be Cloudflare login/account selection, plan
activation, domain-level route/DNS setup, entering secrets, setting the emergency
override, and configuring budget alerts. Exact repository commands belong in
`docs/cloudflare-operations.md` after implementation names exist.

## First implementation checkpoint

After this gate is approved, the first implementation work should be local only:

1. add the minimal Dockerfile and bind-address configuration;
2. build and measure startup, resident memory, health, MCP streaming, reconnect,
   and sleep/restart behavior with no production credentials;
3. confirm `lite` is safe or return to the cost gate if `basic` is required; then
4. implement and test the Worker/fixed-object safety boundary before creating any
   production resource.

This checkpoint passed locally with `lite`. The separately approved production
deployment, required secrets, and custom hostname now exist. The disabled
deployment was verified first. A later live kill-switch exercise verified
disabled version `fd5696b7-d2ea-4f3c-9a1a-88cf22d29caa` before enabling version
`ad2b3a21-b31a-419c-9daa-cab62b151c27` for controlled acceptance. Health, OAuth
metadata, anonymous rejection, and no unauthorized Container wake are verified.
Live Auth0 sign-in and a read-only Nemlig acceptance call remain pending; no
basket mutation is authorized.

## Official Cloudflare sources

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
- [Container limits and instance types](https://developers.cloudflare.com/containers/platform/limits/)
- [Container scaling and routing](https://developers.cloudflare.com/containers/configuration/scaling-and-routing/)
- [Container placement](https://developers.cloudflare.com/containers/concepts/placement/)
- [Container lifecycle and ephemeral disk](https://developers.cloudflare.com/containers/faq/)
- [Container access to Worker bindings](https://developers.cloudflare.com/containers/configuration/workers-connections/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Object data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Workers Rate Limiting binding limitations](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Workers virtual filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)
- [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
