# Cloudflare operations for Nemlig MCP

Status: production version `72941409-a809-40a9-adf2-d7e4b1aa9ddc` is enabled
for private family use. Health, OAuth metadata, anonymous rejection, Auth0
sign-in, hosted-app action discovery, authenticated read and basket-add flows,
and no unauthorized Container wake are verified. The deployed application
revision is `9e321f2910c8e9bd357215c3efab9e46bb77741c`.

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
   client cannot receive a token for this API. Use a distinct Auth0 API
   identifier for each hosted resource URL.

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

   Configure the private ChatGPT app named `Nemlig Assistant` with the production
   `/mcp` URL, OAuth with Dynamic Client Registration, and the default
   `use:nemlig-assistant` scope. Confirm its connection reports OAuth.

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
The item was not removed by the addition test. A later, separately approved
removal used the hosted prepare/apply flow and a fresh readback confirmed an
empty basket with zero products and a 0.00 DKK product total.

The human-friendly confirmation promotion first deployed disabled version
`2eba6882-e363-4653-a239-b2b02edffa3b`. Both production routes returned HTTP
503 and the fixed Container remained inactive. Enabled version
`72941409-a809-40a9-adf2-d7e4b1aa9ddc` then passed the credential-free edge
probe. Refreshing the app showed the canonical `Nemlig Assistant` name. A live
ChatGPT basket read and one prepare-only low-value addition used concise
shopping copy with no internal IDs, proposal metadata, expiry data, raw field
names, or apply call; the basket remained unchanged.

## Verify production features and approved reversible mutations

Run the credential-free edge probes at any time:

```sh
pnpm --filter nemlig-assistant production:probe
```

They verify enabled health, OAuth resource metadata, anonymous rejection, and
foreign-origin rejection. With a current owner access token, the default full
acceptance command verifies the closed tool/resource inventory, discovery,
favorites, guided planning, departments, basket view, picker metadata, missing
plan handling, and all four proposal preparation paths. It does not save a plan,
create a GitHub issue, or call any apply tool:

```sh
read -rs NEMLIG_MCP_ACCESS_TOKEN
export NEMLIG_MCP_ACCESS_TOKEN
pnpm --filter nemlig-assistant production:test:features
unset NEMLIG_MCP_ACCESS_TOKEN
```

Stateful acceptance is separate. Prepare both the intended mutation and its
inverse restoration, show both complete reviews to the owner, and obtain exact
approval for each. Encode each as an object containing `operation`,
`prepareArguments`, and the complete `expectedReview`. Supply each serialized
object twice so an accidental partial environment cannot apply it:

```sh
read -rs NEMLIG_MCP_ACCESS_TOKEN
export NEMLIG_MCP_ACCESS_TOKEN
read -r "NEMLIG_PRODUCTION_MUTATION?Approved mutation JSON: "
export NEMLIG_PRODUCTION_MUTATION
export NEMLIG_PRODUCTION_MUTATION_CONFIRMATION="$NEMLIG_PRODUCTION_MUTATION"
read -r "NEMLIG_PRODUCTION_RESTORATION?Approved restoration JSON: "
export NEMLIG_PRODUCTION_RESTORATION
export NEMLIG_PRODUCTION_RESTORATION_CONFIRMATION="$NEMLIG_PRODUCTION_RESTORATION"
pnpm --filter nemlig-assistant production:test:mutation
unset NEMLIG_MCP_ACCESS_TOKEN NEMLIG_PRODUCTION_MUTATION \
  NEMLIG_PRODUCTION_MUTATION_CONFIRMATION NEMLIG_PRODUCTION_RESTORATION \
  NEMLIG_PRODUCTION_RESTORATION_CONFIRMATION
```

The command accepts additions, removal, replacement, or clear envelopes, applies
only the unchanged approved proposal, reads the basket back, applies only the
separately approved inverse, and requires the final basket fingerprint to equal
the initial fingerprint. It never retries an indeterminate apply.

### 2026-09-01 production-only cleanup verification

The credential-free production probe passed enabled health, OAuth resource
metadata, anonymous rejection, and foreign-origin rejection after the repository
tunnel path was removed. The installed ChatGPT app detail showed the current name
`Nemlig Assistant`, version `1.0.0`, and the hosted description. An existing
authenticated conversation still showed a successful favorites lookup with an
explicit no-basket-change result; its older source pill retained the former name
as conversation history only.

The full authenticated feature command was not run because no owner access token
was available to the repository process. No new ChatGPT prompt, saved plan,
GitHub issue, proposal apply, or basket mutation was sent. Run
`production:test:features` when a current owner token is available. Run
`production:test:mutation` only after both exact change and restoration envelopes
receive their separate approvals.

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

## Retire a legacy local service manually

The repository no longer installs or controls a local ChatGPT forwarding
service. If an older macOS LaunchAgent remains on a machine, retire it manually
only after the hosted app is verified:

1. Inspect `launchctl list` and running processes for the exact legacy service.
2. Use `launchctl bootout` with that exact service path or label.
3. Verify the process is gone and no related listener remains.
4. Remove only the confirmed legacy LaunchAgent and its local support files.

This cleanup is machine-local and intentionally is not performed by repository
scripts. Revoking or deleting any external provider resource remains a separate
owner action.

## Residual cost signals

Investigate unexpected `container_started` events, sustained `usage_admitted`
counts, repeated rate limits, a breaker trip, large Worker log volume, or a
Container that does not sleep after 10 minutes. The architectural ceiling is one
`lite` Container; authenticated activity, Worker requests, logs, egress, other
Cloudflare account workloads, Auth0, GitHub, domain, and Nemlig costs can still
add charges. Budget alerts do not stop usage.
