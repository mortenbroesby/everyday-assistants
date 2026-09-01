# Cloudflare operations for Nemlig MCP

Status: production version `7eb3ff2e-759d-4e3b-b2b7-49cf59193384` is enabled
for private family use. Health, OAuth metadata, anonymous rejection, Auth0
sign-in, hosted-app action discovery, authenticated read and basket-add flows,
and no unauthorized Container wake are verified. The deployed application
revision is `bad8290ef29ecea081eeb2e46e2aec0da0c223c5`.

Current production endpoints:

- `https://nemlig-mcp.broesby.dk/mcp`
- `https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp`

Both returned HTTP 503 with `MCP temporarily disabled` during the initial gate
and again on live kill-switch version `fd5696b7-d2ea-4f3c-9a1a-88cf22d29caa`.
The current enabled endpoint returns healthy OAuth metadata and rejects anonymous
MCP initialization with HTTP 401 without starting the Container. The Worker is
`nemlig-mcp-cloudflare-production`; the configured Container is `lite`, EU
placed, sleeps after 10 minutes, and is capped at one instance. Required Auth0
owner and Nemlig credentials are stored as encrypted Worker secrets; this
document records names only, never values.

## Production shape and defaults

The repository deploys one Worker, one fixed EU Container-controller Durable
Object named `nemlig-production`, one fixed EU storage-only Durable Object for
immutable plan snapshots, and at most one sleeping `lite` Container. The Worker
is disabled by default. Useful operations default to 5,000/day, expensive operations
to 500/day, and per-minute owner limits to 60 normal and 10 expensive. Valid MCP
messages other than `tools/call` are protocol traffic and do not consume
useful-operation quota, but an open breaker
still prevents it from waking the Container.

The Worker CPU and subrequest limits are 100 ms and 8. The Auth0 and backend
deadlines are 5 and 35 seconds. Nemlig reads make at most four bounded attempts;
basket mutations make one attempt and retain the existing no-retry-on-uncertainty
contract.

## First deployment and current setup

The account plan, Auth0 API, encrypted secrets, disabled first deployment, and
custom hostname steps below are complete. Keep the procedure for reproduction
and disaster recovery. The current enabled version was deployed only after the
disabled endpoint and no-running-Container state were verified.

1. Activate Workers Paid and configure account-wide budget notifications at USD
   10 (warning) and USD 20 (urgent). These are delayed informational alerts, not
   an instantaneous hard cap. Recurring plan charges may be excluded from the
   alert amount. The stable account entry point is **Workers & Pages > Workers
   plans** (`https://dash.cloudflare.com/<account-id>/workers/plans`); checkout
   URLs are session-specific and should not be shared between devices.
2. Authenticate the current Cloudflare account:

   ```sh
   pnpm --filter nemlig-assistant exec wrangler login
   pnpm --filter nemlig-assistant exec wrangler whoami
   ```

3. In Auth0, create a Custom API whose immutable **Identifier** exactly equals
   the production MCP resource URL, including `/mcp` (for example,
   `https://nemlig-mcp.example.com/mcp`). Enable tenant **Dynamic Client
   Registration (DCR)** and **Resource Parameter Compatibility Profile**, add
   the `use:nemlig-assistant` permission, and authorize that permission as the
   default user-delegated grant for third-party applications. ChatGPT registers
   as a third-party client; without the default grant, login can succeed but the
   client cannot receive a token for this API. Do not reuse a tunnel-specific
   Auth0 API identifier for a different hosted resource URL.

4. Keep the production issuer, audience, public URL, custom domain, and safety
   thresholds in `wrangler.jsonc`. Store `NEMLIG_MCP_AUTH0_OWNER_SUBJECT` as an
   encrypted Worker secret. Production uses `keep_vars`, so repository deploys
   retain separately managed secrets. `NEMLIG_MCP_ALLOWED_ORIGINS`,
   `NEMLIG_MCP_REQUIRED_SCOPE`, and `NEMLIG_MCP_REVISION` remain optional.

5. Add actual credentials as encrypted secrets. `GH_TOKEN` is optional; omit it
   if hosted feature-request creation is not wanted.

   ```sh
   pnpm --filter nemlig-assistant exec wrangler secret put NEMLIG_USERNAME --env production
   pnpm --filter nemlig-assistant exec wrangler secret put NEMLIG_PASSWORD --env production
   pnpm --filter nemlig-assistant exec wrangler secret put GH_TOKEN --env production
   ```

6. Keep `MCP_ENABLED=false`, validate, then deploy:

   ```sh
   pnpm --filter nemlig-assistant cloudflare:check
   pnpm --filter nemlig-assistant exec wrangler deploy --env production
   ```

7. The repository configures `nemlig-mcp.broesby.dk` as a Worker custom domain.
   Confirm both that URL and the workers.dev fallback return `MCP temporarily
   disabled` before changing `MCP_ENABLED`. Then set it to `true`, deploy, and
   test health, Auth0 rejection, one authenticated MCP handshake, usage
   inspection, and one read-only tool call.

   A tunnel-era ChatGPT app cannot be repointed in place and may show
   `Authorization used: None`. Create a separate hosted app using the production
   `/mcp` URL, OAuth with Dynamic Client Registration, and the default
   `use:nemlig-assistant` scope. Confirm its connection reports OAuth before
   removing any tunnel fallback.

## Emergency disable and re-enable

In Cloudflare, open the production Worker, edit the plain production variable
`MCP_ENABLED`, and choose **Save and deploy**. Set it to `false` to disable or
exactly `true` to re-enable. This is intentionally a configuration override, not
a secret or code change.

Verify disablement before doing anything else:

```sh
curl -i https://YOUR_MCP_HOST/mcp
```

The response must be HTTP 503 with `MCP temporarily disabled`. Cloudflare logs
should show `disabled` and no later `container_invoked` or `container_started`
event for that request.

The live 2026-09-01 exercise deployed disabled version
`fd5696b7-d2ea-4f3c-9a1a-88cf22d29caa`, observed HTTP 503 on the custom domain
and workers.dev route, and found no running Container instance after the probes.
It then deployed enabled version `ad2b3a21-b31a-419c-9daa-cab62b151c27`, observed
HTTP 200 health and OAuth metadata plus HTTP 401 for anonymous MCP initialization,
and again found no running Container instance.

A subsequent `wrangler rollback` rehearsal moved 100% of traffic back to the
same disabled version, reverified HTTP 503 and no running Container, then restored
100% of traffic to the enabled version. The restored deployment returned HTTP
200 health and still had no running Container instance.

The 2026-09-01 hosted-app acceptance deployed disabled version
`3e24b2b8-596c-4494-b338-593ba9478fa0`, observed HTTP 503 on both routes and an
inactive fixed Container, then deployed enabled version
`36261629-4ffe-4178-8e8c-3f826ee8167d`. Both health routes returned HTTP 200.
Refreshing the connected ChatGPT app rediscovered its actions, and live logs
classified every discovery request as `protocol` with no normal or expensive
usage admission. The subsequent authenticated acceptance lookup returned one
favorite without changing the basket; logs admitted exactly one `normal`
operation with `expensive: 0` and no apply-class operation.

The approved write acceptance initially exposed that proposals were scoped to
one transient MCP transport, so a normal ChatGPT approval round trip could not
apply them. Revision `bad8290ef29ecea081eeb2e46e2aec0da0c223c5` shares proposal
state across the single authenticated owner's hosted transports while retaining
expiry, immutable details, and owner binding. Disabled version
`92a524b5-8395-432f-8ea6-ad37b9a49fc4` returned HTTP 503 on both routes before
enabled version `7eb3ff2e-759d-4e3b-b2b7-49cf59193384` passed the safe edge
probes. The hosted app then prepared and applied exactly one `Banan` at 2.50 DKK;
a fresh readback showed one product totaling 2.50 DKK and no other basket change.
The item was intentionally not removed.

## Verify production, including one approved addition

Run the credential-free edge probes at any time:

```sh
pnpm --filter nemlig-assistant production:probe
```

They verify enabled health, OAuth resource metadata, anonymous rejection, and
foreign-origin rejection. The full acceptance command is intentionally limited
to `view_cart`, `prepare_cart_additions`, and `apply_cart_additions`. First obtain
a current owner access token and an exact prepared product review. The owner must
approve its product ID, name, package or size, quantity, unit price, and line
total. Then supply those exact values through the process environment:

```sh
read -rs NEMLIG_MCP_ACCESS_TOKEN
export NEMLIG_MCP_ACCESS_TOKEN
export NEMLIG_PRODUCTION_TEST_PRODUCT_ID=PRODUCT_ID
export NEMLIG_PRODUCTION_TEST_PRODUCT_NAME='EXACT PRODUCT NAME'
export NEMLIG_PRODUCTION_TEST_UNIT_SIZE='EXACT PACKAGE OR SIZE'
export NEMLIG_PRODUCTION_TEST_QUANTITY=QUANTITY
export NEMLIG_PRODUCTION_TEST_UNIT_PRICE=UNIT_PRICE
export NEMLIG_PRODUCTION_TEST_LINE_TOTAL=LINE_TOTAL
export NEMLIG_PRODUCTION_TEST_APPROVAL='{"productId":PRODUCT_ID,"productName":"EXACT PRODUCT NAME","unitSize":"EXACT PACKAGE OR SIZE","quantity":QUANTITY,"unitPrice":UNIT_PRICE,"lineTotal":LINE_TOTAL}'
pnpm --filter nemlig-assistant production:test:add
unset NEMLIG_MCP_ACCESS_TOKEN NEMLIG_PRODUCTION_TEST_PRODUCT_ID \
  NEMLIG_PRODUCTION_TEST_PRODUCT_NAME NEMLIG_PRODUCTION_TEST_UNIT_SIZE \
  NEMLIG_PRODUCTION_TEST_QUANTITY NEMLIG_PRODUCTION_TEST_UNIT_PRICE \
  NEMLIG_PRODUCTION_TEST_LINE_TOTAL NEMLIG_PRODUCTION_TEST_APPROVAL
```

The command refuses to apply if the prepared proposal differs from the approved
values. It verifies the apply response against a fresh basket readback and never
removes the test item. Removal requires its own exact proposal and approval.

## Inspect usage and reset the breaker

Use a current owner access token without placing it in command history:

```sh
read -rs MCP_OWNER_TOKEN
curl -sS -H "Authorization: Bearer $MCP_OWNER_TOKEN" https://YOUR_MCP_HOST/admin/usage
curl -sS -X POST -H "Authorization: Bearer $MCP_OWNER_TOKEN" https://YOUR_MCP_HOST/admin/reset-breaker
unset MCP_OWNER_TOKEN
```

Inspection returns only the UTC period, normal/expensive counts, minute windows,
breaker status, and enumerated trip reason/time. Reset requires the same Auth0
owner, subject, audience, and scope checks as MCP use. The next UTC day also
resets lazily. If state cannot be inspected, leave the MCP disabled rather than
bypassing admission.

Cloudflare structured logs use only these bounded event classes: `disabled`,
`configuration_rejected`, `authentication_rejected`, `usage_admitted`,
`rate_limited`, `breaker_tripped`, `breaker_rejected`, `breaker_reset`,
`container_invoked`, `container_started`, `container_stopped`,
`container_error`, `backend_timeout`, and `backend_failed`. They contain no
tokens, credentials, prompts, plan contents, basket contents, or Nemlig product
data.

## Rotate secrets

Leave the MCP disabled, run the relevant `wrangler secret put ... --env
production` command above, deploy if Cloudflare does not create a deployment
automatically, verify anonymous rejection and one read-only owner call, then
re-enable. Rotate the upstream credential too; changing only Cloudflare's copy
does not revoke the old credential.

## Roll back

Disable first. In Cloudflare Deployments, select the last recorded verified
deployment and roll it back, or redeploy its exact Git commit with:

```sh
git switch --detach VERIFIED_COMMIT
pnpm install --frozen-lockfile
pnpm --filter nemlig-assistant cloudflare:check
pnpm --filter nemlig-assistant exec wrangler deploy --env production
```

Keep `MCP_ENABLED=false` until the rolled-back revision, Auth0 rejection, usage
state, and read-only flow are verified. Never roll back by loosening quotas or
creating another Container.

## Remove the deployment

Disable and remove its route/DNS first, then delete the Worker/Container
deployment, both fixed Durable Object data sets, and Worker secrets in Cloudflare. Finally
cancel Workers Paid only if the account has no other workload. Durable Object
data deletion is intentionally a manual destructive operation so saved state is
not erased by an ordinary rollback.

## Residual cost signals

Investigate unexpected `container_started` events, sustained `usage_admitted`
counts, repeated rate limits, a breaker trip, large Worker log volume, or a
Container that does not sleep after 10 minutes. The architectural ceiling is one
`lite` Container; authenticated activity, Worker requests, logs, egress, other
Cloudflare account workloads, Auth0, GitHub, domain, and Nemlig costs can still
add charges. Budget alerts do not stop usage.
