# Cloudflare operations for Nemlig MCP

Status: repository implementation only; no production resource or DNS change has
been made.

## Production shape and defaults

The repository deploys one Worker, one fixed EU Container-controller Durable
Object named `nemlig-production`, one fixed EU storage-only Durable Object for
immutable plan snapshots, and at most one sleeping `lite` Container. The Worker
is disabled by default. Useful operations default to 5,000/day, expensive operations
to 500/day, and per-minute owner limits to 60 normal and 10 expensive. Protocol
handshake traffic does not consume useful-operation quota, but an open breaker
still prevents it from waking the Container.

The Worker CPU and subrequest limits are 100 ms and 8. The Auth0 and backend
deadlines are 5 and 35 seconds. Nemlig reads make at most four bounded attempts;
basket mutations make one attempt and retain the existing no-retry-on-uncertainty
contract.

## First deployment

Do these only after separately approving production creation and the expected
Workers Paid baseline cost.

1. Activate Workers Paid and configure account-wide budget notifications at USD
   10 (warning) and USD 20 (urgent). These are delayed informational alerts, not
   an instantaneous hard cap. Recurring plan charges may be excluded from the
   alert amount.
2. Authenticate the current Cloudflare account:

   ```sh
   pnpm --filter nemlig-assistant exec wrangler login
   pnpm --filter nemlig-assistant exec wrangler whoami
   ```

3. In the production Worker's Variables and Secrets settings, add these plain
   variables. Production uses `keep_vars` so repository deploys retain them:

   - `NEMLIG_MCP_AUTH0_ISSUER`
   - `NEMLIG_MCP_AUTH0_AUDIENCE`
   - `NEMLIG_MCP_AUTH0_OWNER_SUBJECT`
   - `NEMLIG_MCP_PUBLIC_URL` (the exact HTTPS URL ending in `/mcp`)
   - optionally `NEMLIG_MCP_ALLOWED_ORIGINS`, `NEMLIG_MCP_REQUIRED_SCOPE`, and
     `NEMLIG_MCP_REVISION`

4. Add actual credentials as encrypted secrets. `GH_TOKEN` is optional; omit it
   if hosted feature-request creation is not wanted.

   ```sh
   pnpm --filter nemlig-assistant exec wrangler secret put NEMLIG_USERNAME --env production
   pnpm --filter nemlig-assistant exec wrangler secret put NEMLIG_PASSWORD --env production
   pnpm --filter nemlig-assistant exec wrangler secret put GH_TOKEN --env production
   ```

5. Keep `MCP_ENABLED=false`, validate, then deploy:

   ```sh
   pnpm --filter nemlig-assistant cloudflare:check
   pnpm --filter nemlig-assistant exec wrangler deploy --env production
   ```

6. Configure the custom hostname/route and DNS only after the disabled endpoint
   returns `MCP temporarily disabled`. Set the plain `MCP_ENABLED` production
   variable to `true`, save and deploy, then test health, Auth0 rejection, one
   authenticated MCP handshake, usage inspection, and one read-only tool call.

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
