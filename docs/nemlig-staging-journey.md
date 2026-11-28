# Verify the synthetic shopping journey

## Laptop and CI

From the checkout root with its pinned Node and pnpm versions and a working Docker engine, run:

```sh
pnpm install --frozen-lockfile
pnpm --filter nemlig-assistant journey:local
```

Wrangler listens on a fresh HTTPS loopback port. Each run creates an ephemeral RSA signer, serves its public discovery and JWKS material inside the two local runtimes, and uses fresh local Durable Object state. The backend verifies the signed JWT through the app's normal verifier. Colima supplies Docker on the Mac. CI uses the runner's Docker engine on changes affecting the app, image or pipeline.

The client discovers the MCP server twice, searches for synthetic lactose-free milk, opens the returned draft, reads the viewer, changes one unit to two and reopens the exact draft. The draft lives in the running container for its normal lifetime. The Durable Object controller handles principal admission and the local basket capability. The report includes fixed operation names, response status, protocol outcomes and elapsed milliseconds.

Read each discovery sample's observed container state alongside authentication time, time to readiness, time to MCP response headers and total client time. The first local run starts with isolated state and a fresh container. Hosted requests can both be warm when another shopper recently used staging. To sample after sleep, allow at least ten idle minutes, then run the two requests back to back. A gap between headers and client completion can include body transfer and parsing. Rendering requires a separate native observation.

## Provision private staging

The stable MCP URL is `https://nemlig-staging.broesby.dk/mcp`. The dedicated Worker owns its custom domain, one EU lite container and separate SQLite Durable Object namespaces. Its container uses the synthetic shopper entrypoint and can reach only the development issuer and the internal state callback. The viewer loads the staging build from the same origin. Public OAuth discovery and static assets allow the connector to initialize. Access to MCP requires a token for the staging audience and an explicitly enabled staging principal.

1. In a development Auth0 tenant, register the staging MCP URL as an RS256 API with permission `use:nemlig-assistant`. Grant a dedicated machine-to-machine test application this permission. Create the invited test shopper for interactive sign-in and restrict its login connection to approved test accounts.
2. Set up the private ChatGPT connection with this staging URL and OAuth. Use the actual ChatGPT client metadata and exact callback for this connection as described in the [connector recovery record](chatgpt-connector-recovery.md#canonical-configuration). Grant the staging client access to the staging API. Verify the issuer and audience through the actual connector sign-in.
3. Configure the protected GitHub environment `nemlig-staging` with required deployment approval and a deployment branch rule for `main`. Supply the variables `CLOUDFLARE_ACCOUNT_ID`, `STAGING_AUTH0_ISSUER` and `STAGING_AUTH0_CLIENT_ID`. Its secrets are `CLOUDFLARE_API_TOKEN`, `STAGING_AUTH0_CLIENT_SECRET`, `STAGING_PRINCIPALS` and `STAGING_CREDENTIAL_KEY`. Use credentials scoped for staging. The principals JSON follows the existing v3 policy schema, with the human test subject as owner and the machine client's `<client-id>@clients` subject as a separate enabled member. Give each a distinct random principal key. Generate the environment encryption key from 32 random bytes encoded as base64url.
4. Dispatch **Nemlig private staging** from main with the full reviewed SHA. The workflow checks successful CI and trusted repository history before deployment. For an unmerged change it also checks the exact head of an approved same-repository PR. Review that SHA when approving the protected environment. The client checks the Worker revision, the source revision baked into the running image, and the synthetic shopper journey.
5. For a repeat against the same release, supply a short-lived staging token via `NEMLIG_JOURNEY_TOKEN` and its full SHA via `NEMLIG_JOURNEY_EXPECTED_REVISION`, then run `pnpm --filter nemlig-assistant journey:staging`. Keep tokens out of shell history and artifacts.

The workflow runs on demand. The idle timer is ten minutes and the instance limit is one. Build minutes, active container time, stored images, Durable Object usage and any Auth0 plan charges are the incremental cost drivers. Frequent runs can keep the container awake continuously. Local CI uses no hosted staging resources. To stop staging use, disable its MCP ingress with the staging Worker kill switch and stop dispatching the workflow.

## Verify the installed ChatGPT connection

In a fresh chat select the private staging connection, complete development Auth0 sign-in and request lactose-free milk. Confirm the displayed product is the synthetic Journey milk. Open the review card for one unit, increase it to two, reopen the same draft and verify the displayed quantity. Record the SHA, time, sign-in outcome, renderer visibility, edit and reopen results. Keep tokens, draft handles, account details and conversation URLs private.

Use the [failure compendium](nemlig-failure-compendium.md#run-checklist-and-report-template) to record the applicable native failure IDs, including renderer discovery and edit-control visibility. A deployed service run and an observed native card have separate results in the issue. See [issue 393](https://github.com/mortenbroesby/everyday-assistants/issues/393).
