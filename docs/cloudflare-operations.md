# Cloudflare operations for Nemlig MCP

Historical production checkpoint (not a current deployment claim): version `1e088bde-55ff-429a-a6dc-09d7e88360d3` is enabled
for private family use. Health, OAuth metadata, anonymous rejection, Auth0
authorization through the existing hosted app, authenticated basket and
shopping-list reads, and no unauthorized Container wake are verified. The
deployed application revision is `7566d1eec1b435b86ef86afc50c45c14ffd8c9cd`.

Current production endpoints:

- `https://nemlig-mcp.broesby.dk/mcp`
- `https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp`

Both returned HTTP 503 with `MCP temporarily disabled` during the initial gate
and again on live kill-switch version `fd5696b7-d2ea-4f3c-9a1a-88cf22d29caa`.
The current enabled endpoint returns healthy OAuth metadata and rejects anonymous
MCP initialization with HTTP 401 without starting the Container. The Worker is
`nemlig-mcp-cloudflare-production`; the configured Container is `lite`, EU
placed, sleeps after 10 minutes, and is capped at one instance. The currently
deployed owner-only policy is the schema-v1 migration source. Schema v2 keeps
only the static owner identity, tier budgets, Auth0 Organization, and invitation
default in `NEMLIG_MCP_PRINCIPALS`; accepted users' sealed credential records
live in the existing fixed controller Durable Object. This document records
field names only, never values.

## Production shape and defaults

The repository deploys one Worker, one fixed EU Container-controller Durable
Object named `nemlig-production`, and at most one sleeping `lite` Container. The
legacy `PlanStorage` class, namespace binding and migration history are retained
only to preserve existing records and rollback: its handler returns 410 without
storage access, and the application no longer forwards saved-shopping requests.
Do not delete that namespace or stored records as part of a routine deployment. The Worker
is disabled by default. Useful operations default to 5,000/day, expensive operations
to 500/day, and per-minute owner limits to 60 normal and 10 expensive. Valid MCP
messages other than `tools/call` are protocol traffic and do not consume
useful-operation quota, but an open breaker
still prevents it from waking the Container.

The Worker CPU and subrequest limits are 100 ms and 8. Every request has a
90-second total deadline. Auth0 is capped at 5 seconds, Durable Object control
calls at 3 seconds, and Container work at 85 seconds or the remaining total
budget, whichever is smaller. Each Nemlig read attempt may use up to 60 seconds;
only an early transport failure can trigger the one bounded retry. Mutations
make one attempt and retain the existing no-retry-on-uncertainty
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
   thresholds in `wrangler.jsonc`. Store `NEMLIG_MCP_PRINCIPALS` as one
   encrypted Worker secret using the owner-only procedure below. Production
   uses `keep_vars`, so repository deploys retain separately managed secrets. `NEMLIG_MCP_ALLOWED_ORIGINS`,
   `NEMLIG_MCP_REQUIRED_SCOPE`, and `NEMLIG_MCP_REVISION` remain optional.

5. The runtime no longer submits GitHub issues and does not forward `GH_TOKEN`.
   Do not provision a GitHub token for the assistant. Existing provider-held
   secrets are unchanged by this source removal; any cleanup is a separate
   owner credential operation. The three legacy owner secrets are accepted only
   as exact migration checks against policy, not runtime fallbacks, and must
   never be reused for an invitee.

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

   Configure the private ChatGPT app named exactly `Nemlig Assistant` with the production
   `/mcp` URL, OAuth with Dynamic Client Registration, and the default
   `use:nemlig-assistant` scope. Confirm its connection reports OAuth. Ordinary
   releases update this app in place with **Refresh**; never create a `(new)`,
   bracketed, numbered, or parallel Nemlig app.

## Self-service credential onboarding

The onboarding implementation is disabled by default with
`MCP_CREDENTIAL_ONBOARDING_ENABLED=false`. It reuses the current Auth0 tenant,
Worker, fixed controller Durable Object, and one-Container ceiling. It adds no
polling, scheduler, queue, database, email provider, Management API client, or
automatic retry. At most fifteen invited principals can be stored. Validation
is limited to three attempts per principal and ten total attempts per minute;
each attempt performs one Nemlig login and one authenticated read.

Before enabling it, use the Auth0 Dashboard to confirm Organizations and native
invitations are available on the current plan without a plan or payment change.
Create exactly one Organization and one confidential Regular Web Application.
Configure only this callback:

```text
https://nemlig-mcp.broesby.dk/connect/callback
```

Record the non-secret Organization and client identifiers in production
configuration. Keep the existing ChatGPT-created third-party client and API/DCR
settings unchanged and organization-unaware. Through Wrangler's hidden prompt,
store the web-client secret, a random 32-byte base64url browser-session key, and
a separate 32-byte base64url credential-encryption key as
`NEMLIG_MCP_ONBOARDING_CLIENT_SECRET`, `NEMLIG_MCP_ONBOARDING_SESSION_KEY`, and
`NEMLIG_MCP_CREDENTIAL_KEY`. Set a non-secret key-version label in
`NEMLIG_MCP_CREDENTIAL_KEY_VERSION`. Never place these values in a command
argument, repository file, issue, chat, log, screenshot, or temporary file.

Issue invitations only through the Auth0 Organization Dashboard or its native
generated invitation link delivered through an existing secure channel. The
invitee follows the Auth0 link, signs in with the exact invited email, and enters
their own Nemlig login only at `https://nemlig-mcp.broesby.dk/connect`. The page
does not accept credentials in a ChatGPT message, MCP argument, or elicitation
form. URL-mode elicitation is used only when a client advertises it; otherwise
the MCP result gives the same fixed page manually. Real ChatGPT URL-elicitation
support remains an acceptance observation, not a deployment assumption.

An accepted invitation creates a pending Tier 1 principal. One successful,
rate-limited read-only validation atomically stores the sealed generation and
activates that principal. Failed replacement preserves the last known-good
generation. Users can replace or revoke only their own connection; the owner
portal can disable or revoke invitee access. Rotation invalidates old MCP
sessions on their next request, and revocation removes the current generation.
Status exposes only `connected`, `connection_required`, or
`reconnect_required` plus the fixed connection URL.

For rollout, keep both `MCP_ENABLED` and onboarding false, deploy the exact
CI-green revision, and verify both surfaces fail closed without Container
activity. Enable onboarding alone for owner migration, validate and store the
owner credential through the page, switch to schema v2, then enable MCP and run
read-only owner acceptance. Only then issue an invitee. If any identity,
isolation, validation, cost, or provider gate fails, disable both switches and
restore the recorded schema-v1 secret and previous Worker version. Do not remove
the fallback or its rollback material until owner and invitee acceptance passes.

For an incident, disable onboarding first; disable MCP too if credential
selection, principal isolation, or encryption-key integrity is uncertain.
Revoke the affected principal or credential in the owner portal, rotate the
upstream Nemlig password when upstream revocation is intended, and rotate the
encryption key if ciphertext confidentiality may be compromised. Inspect only
sanitized terminal/lifecycle events and aggregate limits—never request bodies,
cookies, invitation links, subjects, credentials, envelopes, or provider
responses.

## Automated production release

Routine CI releases use the manual **Nemlig production** workflow with the exact green `main` SHA. The protected `nemlig-production` environment holds a scoped Cloudflare deployment token and a dedicated Auth0 machine client secret. CI never requests an owner access token, password or browser session.

One-time setup is complete: the `nemlig-production` environment requires the owner reviewer, permits only `main`, and contains the two scoped secrets and three non-secret variables required by the workflow. Routine releases need no owner or 1Password session.

The shared command also supports supervised terminal execution with those same scoped CI credentials:

```sh
pnpm --filter nemlig-assistant production:deploy -- preflight EXACT_MAIN_COMMIT
pnpm --filter nemlig-assistant production:deploy -- --service EXACT_MAIN_COMMIT
```

Initial cutover and runtime boundary changes require `--service-cutover`. It performs machine acceptance, records `live_acceptance_pending`, and retains recovery ownership until actual live acceptance for that revision is recorded in `apps/nemlig-assistant/release/production-cutover.json`. Real-user checks run through the existing app outside CI. The initial record is null; ordinary service mode fails closed until a cutover is accepted. Unknown changed paths also require the supervised path. Legacy explicit local owner mode remains available but is never CI's fallback.

The command verifies local HEAD, refreshed remote `main`, exact-head CI, and the required protected environment before issuing one bounded machine token or changing Cloudflare. Token validation checks signature, issuer, audience, exact identity/scope and remaining expiry. Fixture checks prove runtime transport and isolation; they do not prove live Nemlig or ChatGPT behavior.
It takes an exclusive lock shared by linked worktrees and atomically creates
`refs/heads/codex-lock/nemlig-production` for a unique operation UUID, not the
source SHA. The ref contains a bounded public-safe recovery journal. It records the
starting version, builds and deploys once with `MCP_ENABLED=false`, verifies both
routes and an inactive Container, enables the same revision with no Container
rollout, and runs the existing bounded edge and authenticated read-only checks.
It never prepares or applies a proposal and never mutates a basket, favorite, or
saved list.

The remote journal is authoritative; the common Git directory's
`nemlig-production-deploy/latest.json` is a local mirror. Snapshots contain only
operation/run identifiers, source/version IDs, image digests, timestamps,
allowlisted checks and failure categories, and intent/result state. Each snapshot
is limited to 8 KiB and 32 transitions. Remote intent and its local mirror must
persist before a provider mutation. An uncertain command or failed result write
retains ownership without retrying or automatically rolling back that command.
The operation has a 25-minute deadline; cancellation terminates the command's
process group before returning.

After the deployment command stops and the bounded report artifact is saved, a
known terminal routine run invokes exact-state finalization automatically. A
cutover, failed artifact upload, pending intent, unknown state or drift retains
both leases for explicit inspection and finalization. Finalization requires the exact operation UUID,
complete terminal evidence, matching current Worker/configuration/application/instance and unchanged remote
journal head. Missing evidence, pending intent, unknown state or drift blocks
cleanup. A legacy source-SHA lease also blocks new releases; never steal it or
delete it on an age/TTL assumption.

```sh
pnpm --filter nemlig-assistant production:deploy -- inspect-recovery OPERATION_UUID
# Only after independently confirming the original runner has stopped:
pnpm --filter nemlig-assistant production:deploy -- inspect-recovery OPERATION_UUID --original-runner-stopped
# Only after saving complete final evidence and reconciling the exact state:
pnpm --filter nemlig-assistant production:deploy -- finalize OPERATION_UUID --evidence-saved --original-runner-stopped
```

Inspection is read-only and uses at most four provider reads; a stopped-runner
attestation cannot make pending or unknown work cleanup-eligible. Do not rerun an
uncertain release or manually continue its upload steps. GitHub ref deletion has
no compare-and-swap parameter: the final read/delete pair cannot fence an
out-of-protocol actor replacing the ref in that interval. All release clients
must honor the no-steal rule.

Both inspection and finalization require the applicable recorded application
version, configuration digest and starting enabled flag. Old or incomplete journals remain readable but
cannot authorize cleanup. Enabled recovery permits the fixed inactive assignment
or one matching running instance; disabled recovery requires inactive. Neither
operation wakes or polls a Container. Finalization independently requires both
evidence-saved and stopped-runner attestations, then rechecks the remote head.
Rollback and failure recovery also verify configuration, image, application
version and instance state before claiming a known result. A Worker-only rollback
is not proof of image restoration. These local safeguards do not substitute for
approved live cutover/recovery evidence or authorize a production mutation.

Wrangler's Container list can lag an active rollout. Use
`wrangler containers list --env production --json` only to discover the single
application ID, then use `wrangler containers info APPLICATION_ID --env production --json`
for authoritative image and application-version reads. Match that version to
the single accepted instance before reporting convergence.

This automation adds no workflow, CI job, hosted secret, service, dependency,
schedule, or runtime capacity. It adds bounded Git journal objects, with at most
32 snapshots and approximately 164 GitHub API calls plus finalization; ordinary
runs use fewer. The current CI workflow only runs on main pushes and pull
requests, not journal-ref pushes. Each approved release retains the existing one
`lite` Container and cost ceilings and performs one image build/upload, one
no-rollout enable upload, two disabled-route probes, bounded acceptance, and
small GitHub and Cloudflare state reads.

## Emergency disable and re-enable

In Cloudflare, open the production Worker, edit the plain production variable
`MCP_ENABLED`, and choose **Save and deploy**. Set it to `false` to disable or
exactly `true` to re-enable. This is intentionally a configuration override, not
a secret or code change.

Verify disablement before doing anything else:

```sh
curl -i https://YOUR_MCP_HOST/mcp
```

The response must be HTTP 503 with `MCP temporarily disabled`. Its
`x-nemlig-request-id` identifies the single `gateway_request_terminal` event,
whose outcome is `disabled`; there must be no later `container_started` event
for that request window.

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

The 2026-09-04 P0 reliability rollout deployed exact revision
`366f1db37752502c67a109a731dd6840b464cdab` as disabled version
`04c3312d-c139-4d08-87aa-cc8ba8d33396`. Both production routes returned HTTP
503 with correlation IDs and the fixed Container became inactive. Enabled
version `fc8cfb96-53c6-4d38-8ea1-cbca04727b25` reused the same Container image
and passed the custom-domain edge probe: health 194 ms, revision 47 ms, OAuth
metadata 18 ms, anonymous rejection 47 ms, and foreign-origin rejection 12 ms.
The existing authenticated hosted-app connection then returned the active
shopping-list inventory in 4.6 seconds and one favorite in 5.2 seconds. These
calls were read-only and made no basket or saved-list change. A diagnostic
request also produced one privacy-safe `gateway_request_terminal` event with
the expected revision, correlation ID, route class, status, outcome, and elapsed
time only. The workers.dev alias remains a valid fallback route, but its OAuth
metadata intentionally declares the canonical custom-domain resource URL, so
the generic probe's exact-resource assertion applies only to the custom domain.

The 2026-09-04 catalogue-first recovery deployed exact revision
`f17d7c75352a7cd5dbceb91767e65fa68afd9c0b` as disabled version
`b28646e5-c2b5-428f-966a-fd6cf6ca11bd`. Both production routes returned HTTP
503 with `MCP temporarily disabled`, and the fixed instance reported
`inactive`. Enabled version `4a74ac1a-4198-486b-9c2d-89c9aaa411f4` then passed
the custom-domain edge probe at the same revision; the workers.dev health route
also returned HTTP 200. Authenticated ChatGPT catalogue and exact-product
acceptance remains pending because no owner access token was available to the
deployment shell and a background handoff to the existing chat did not start a
new turn. No basket mutation was attempted.

The 2026-09-05 catalogue-wording and fresh-product-revalidation rollout
deployed exact revision `2c952d20999b8ac47f7b060be97f2f84445defcb`
as disabled version `db819ef4-674c-4a56-a1fa-3ad9cc3b01d2`. Both production
routes returned HTTP 503 with `MCP temporarily disabled`, and the sole
Container instance reported `inactive`. Enabled version
`958ad415-2395-40c1-8baf-b394dafce67f` reused the same Container image and
passed the custom-domain edge probe: health 174 ms, revision 119 ms, OAuth
metadata 11 ms, anonymous rejection 21 ms, and foreign-origin rejection 12 ms.
The workers.dev health route also returned HTTP 200. Authenticated ChatGPT
catalogue and apply-time revalidation acceptance remains pending until an owner
login or access token is available. No proposal was prepared or applied, and
no basket, favorite, or saved-list mutation was attempted.

The 2026-09-06 automatic-grocery-run acceptance first deployed revision
`d042f7e79d783329c821ba001c39e91eaf3a9cdc` behind the kill switch, rotated the
owner credential and principal material without recording values, and passed
the credential-free edge probe. In the existing connected ChatGPT app, one
owner-requested automatic run added 27 of 28 shopping lines (96.4%) as 32
products, left one unavailable line unchanged, and read back the resulting
basket. It asked for no additional owner approval and made no checkout,
payment, order, or delivery change. The resulting basket was the requested
deliverable, so no manual cleanup or removal was performed.

That acceptance exposed order-sensitive comparison of the same authorized
addition set. Revision `7566d1eec1b435b86ef86afc50c45c14ffd8c9cd`
canonicalizes the already validated unique product and quantity pairs before
authorization comparison. Disabled version
`0f163d9b-9a2f-4310-ad73-43fa60b3ab9f` returned HTTP 503 on both routes and the
fixed Container instance reported `inactive`; its image digest was
`sha256:55d97849ed60e69f9b5461ae88c95c76eedb2ff38843e27fe195fc2b1a033545`.
Enabled version `1e088bde-55ff-429a-a6dc-09d7e88360d3` then passed the edge
probe: health 145 ms, revision 39 ms, OAuth metadata 13 ms, anonymous rejection
18 ms, and foreign-origin rejection 11 ms. A refreshed authenticated read-only
ChatGPT check confirmed the same 32-product basket, no active shopping lists,
and no mutation. No parallel app, Container, or paid resource was created.

## Verify production features and approved reversible mutations

Run the credential-free edge probes at any time:

```sh
pnpm --filter nemlig-assistant production:probe
```

They verify enabled health, deployment revision, OAuth resource metadata,
anonymous rejection, and foreign-origin rejection with per-step deadlines and
bounded JSON evidence: requested source, observed revision, correlation IDs,
fixed failure categories and last completed boundary. With a current owner access
token, the default full acceptance command verifies the closed tool/resource
inventory and read-only catalogue discovery, exact selected-product reuse,
and at most one explicitly requested favourite result
under one 90-second deadline. It does not write a
list, prepare or apply a proposal, create a GitHub issue, or mutate the basket:

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

This boundary was retained when the tunnel-retirement change was formally
closed: the automated contracts and credential-free production probe passed,
while the optional token-backed feature sweep and reversible live mutation
exercise remain operator-run checks rather than claimed completion evidence.

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

Each request can emit at most one allowlisted `gateway_request_terminal` event.
It contains only schema version, server-generated request ID, revision, route,
method, coarse operation class, terminal outcome, HTTP status, and elapsed
milliseconds. Authenticated useful operations, timeouts, failures, breaker
rejections, and disabled/configuration outcomes are always retained. Ordinary
public protocol successes and authentication rejections are deterministically
sampled at one percent. Sparse lifecycle events are limited to Container
start/stop/error and breaker trip/reset. Logs contain no raw errors, headers,
bodies, query strings, tokens, credentials, cookies, OAuth artifacts, prompts,
tool arguments, shopping data, provider responses, or stacks.

This adds no log drain or paid service. Mandatory request events are bounded by
one per admitted useful operation under the existing 5,000-per-day breaker;
public discovery and invalid-auth noise is sampled. The one `lite` Container,
one-instance ceiling, quotas, rate limits, ten-minute sleep, and dynamic
`MCP_ENABLED` kill switch remain unchanged.

## Diagnose a ChatGPT reconnect without collecting secrets

Use the three evidence planes separately; the Worker cannot observe ChatGPT's
authorization UI or Auth0's browser redirect before a request reaches it.

1. Record the UTC start time, the existing ChatGPT app identity (exactly
   `Nemlig Assistant`), and its configured production `/mcp` URL. Do not create
   a duplicate app.
2. Refresh the existing app's metadata in place. Record only completion time and
   whether `/healthz`, `/revision`, and OAuth protected-resource metadata passed,
   including revision and per-step latency from `production:probe`.
3. Start one bounded OAuth reconnect. In Auth0, record only timestamp and a
   non-secret event category such as login success, consent failure, token
   exchange failure, or no event observed. Never copy credentials, access or
   refresh tokens, authorization codes, OAuth state, callback URLs with query
   values, or raw event payloads.
4. Search Worker logs in that same time window. Record only terminal outcome,
   correlation ID, revision, route, status, and elapsed time. If there is no
   Worker event, the last completed boundary is before the Worker—ChatGPT app
   state, browser authorization, or Auth0—not the Container or Nemlig.
5. After reconnect succeeds, open two fresh normal ChatGPT conversations. In
   each, check the connection and request at most one favorite. Record only pass
   or fail, timestamps, and Worker correlation IDs; do not record returned
   private data. Do not create/edit lists, prepare/apply proposals, submit a
   feature request, or mutate the basket.

## Rotate secrets

### Create or rotate the private principal policy

Schema v1 is the bounded single-owner migration format and contains the owner's
credential. Schema v2 contains a non-secret revision, tier budgets, one enabled
Tier 0 owner identity/key, the exact Auth0 Organization ID, and a fixed Tier 1
invitation default; it contains no Nemlig credential or dynamic invitee. Do not
put either real policy in a command argument, environment file, repository file,
issue, chat, log, or test.

1. Keep the current policy recoverable in the owner's password manager, prepare
   the complete replacement there, and validate only an equivalent synthetic
   document in repository tests. Never assemble the real JSON in shell history
   or a temporary file.
2. Set `MCP_ENABLED=false`, deploy that state, and prove both routes reject
   before authentication, Durable Object access, or Container wake.
3. Run the hidden interactive prompt below and paste the complete policy value
   directly when Wrangler asks for it. Do not print or echo it.

   ```sh
   pnpm --filter nemlig-assistant exec wrangler secret put NEMLIG_MCP_PRINCIPALS --env production
   ```

4. Keep production disabled while validating the new revision, one enabled
   Tier 0 entry, configured limits, anonymous rejection, and unknown-principal
   denial. Enable the same application revision only after those checks pass,
   then run the bounded Tier 0 read-only acceptance.
5. If validation or acceptance fails, restore the recorded prior policy through
   the same hidden prompt and restore the exact prior Worker version. If either
   state is uncertain, leave the MCP disabled.

Changing Cloudflare's copy does not revoke an old Nemlig password. Rotate the
upstream credential when revocation is intended. After an owner-only migration
is accepted, remove the three legacy owner secrets in a separate disabled-first
rotation; they are not needed for runtime lookup.

### Stage and later enable an invitee

An invitee is a separate principal and Nemlig account, never an alias for the
family account. In schema v2, do not add the invitee or credential to the static
policy. Issue a native Organization invitation; successful redemption creates a
pending Tier 1 record and successful credential validation activates it. A
disabled record must still be denied before usage-state access or Container wake.

Before changing that entry to `enabled: true`, perform a separately approved
two-account read-only isolation exercise: each identity must see only its own
favorites and basket; guessed session and proposal references from the other
account must return the same non-sensitive
denial; equal usage must receive the same admission decision across Tier 0,
Tier 1, and Tier 2. Record only pass/fail, policy revision, tier labels, denial reasons,
correlation IDs, and aggregate headroom. Do not record subjects, opaque keys,
credentials, returned shopping data, or per-principal counts.

If any identity, credential, state, or accounting boundary is uncertain, keep
the invitee disabled and restore the last verified policy. Invitee activation
does not authorize a basket mutation.

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

Investigate unexpected `container_started` events, sustained admitted useful
request counts, repeated rate limits, a breaker trip, large Worker log volume, or a
Container that does not sleep after 10 minutes. The architectural ceiling is one
`lite` Container; authenticated activity, Worker requests, logs, egress, other
Cloudflare account workloads, Auth0, GitHub, domain, and Nemlig costs can still
add charges. Budget alerts do not stop usage.
