# Cloudflare operations for Nemlig MCP

Production state is time-sensitive. For releases, follow **Automated
production release** below. After a failed or interrupted release, use
**Correct a failed deployment** to inspect current provider state before any
separately reviewed corrective deployment. Historical incident records below
are evidence only, not current instructions.

Production endpoints:

- `https://nemlig-mcp.broesby.dk/mcp`
- `https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp`

At 2026-10-05 19:31 UTC, a read-only incident check found both routes returned
HTTP 503 with `MCP temporarily disabled`. This is a dated observation, not a
live-status guarantee; recheck both routes before acting. The Worker is
`nemlig-mcp-cloudflare-production`; the configured Container is `lite`, EU
placed, sleeps after 10 minutes, and is capped at one instance. The currently
served policy is not asserted by this source update. Current code accepts only
schema v3: revision, explicit owner subject and configured enabled family
identities/opaque keys. Sealed credential records
remain in the existing fixed controller Durable Object. Authenticated MCP
discovery is provider-independent and does not require a Nemlig credential;
the seven-tool user catalog remains OAuth-gated, while only provider-backed
tools require a Nemlig credential.
This document records
field names only, never values.

## Production shape and defaults

The repository deploys one Worker, one fixed EU Container-controller Durable
Object named `nemlig-production`, and at most one sleeping `lite` Container.
The retired `PlanStorage` namespace was deleted by migration `v2`. Migration `v3` adds the owner-scoped Local basket namespace:
its saved-shopping records are not read or migrated, and cannot be recovered by
rolling back Worker code after that migration deploys. Do not add it back to a
routine deployment without a separately reviewed data-recovery design.
The Worker stays enabled during routine delivery; `MCP_ENABLED=false` is a
manual emergency kill switch. A failed deployment is not automatically rolled
back or disabled. Inspect the live Worker, Container image/version and rollout
state before deciding on a corrective action. Routine preflight verifies the
supported `Container` model, current configuration, and absence of an active
rollout. No lease or journal records release state.

The Worker CPU and subrequest limits are 100 ms and 8. Every request has a
90-second total deadline. Auth0 is capped at 5 seconds, Durable Object control
calls at 3 seconds, and Container work at 85 seconds or the remaining total
budget, whichever is smaller. Each Nemlig read attempt may use up to 60 seconds;
only an early transport failure can trigger the one bounded retry. Mutations
make one attempt and retain the existing no-retry-on-uncertainty
contract.

## First deployment and current setup

The account plan, Auth0 API, encrypted secrets, initial deployment, and custom
hostname steps below are complete. Keep the procedure for historical
reproduction and disaster recovery. Its disabled-first sequence describes the
original bootstrap only; it is not the procedure for routine releases. Normal
releases stay enabled, and global disablement is reserved for emergency
isolation or explicit recovery.

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
   encrypted Worker secret using the owner-only procedure below. Checked-in
   config is the source of truth for plain variables (`keep_vars: false`);
   encrypted Worker secrets remain preserved by deploys. `NEMLIG_MCP_ALLOWED_ORIGINS`,
   `NEMLIG_MCP_REQUIRED_SCOPE`, and `NEMLIG_MCP_REVISION` remain optional.

5. The runtime no longer submits GitHub issues and does not forward `GH_TOKEN`.
   Do not provision a GitHub token for the assistant. The hosted runtime no
   longer reads the legacy owner-subject, username, or password bindings. Keep
   the existing provider-held secrets only until the current encrypted-credential
   deployment is verified; then remove them as a separate owner-controlled
   secret cleanup. They must never be reused for an invitee.

6. For a never-before-deployed Worker only, validate and perform the initial
   deployment. Do not use a disabled staging deploy for a routine release:

   ```sh
   pnpm --filter nemlig-assistant cloudflare:check
   pnpm --filter nemlig-assistant exec wrangler deploy --env production
   ```

7. The repository configures `nemlig-mcp.broesby.dk` as a Worker custom domain.
   For bootstrap, set `MCP_ENABLED=true` as soon as required secrets and
   configuration are ready, then test health, Auth0 rejection, one
   authenticated MCP handshake, usage inspection, and one read-only tool call.

   Configure the private ChatGPT app with the production `/mcp` URL, OAuth with
   Dynamic Client Registration, and the default `use:nemlig-assistant` scope.
   The current recovery app is `Nemlig Assistant (Rejoin)`. Confirm its
   connection reports OAuth and returns the authenticated seven-tool catalog.
   Check provider access separately with `check_nemlig_connection`.
   Ordinary later releases update that app in place with **Refresh**.

## Self-service credential onboarding

The onboarding implementation is disabled by default with
`MCP_CREDENTIAL_ONBOARDING_ENABLED=false`. It reuses the Worker, fixed
controller Durable Object, existing encrypted credential records and
one-Container ceiling. `/connect` has an owner **Sign in** link. The installed
MCP OAuth client handles authorization code with PKCE; a small browser adapter
binds issuer, client, state, expiry and the exact enabled owner to the existing
short-lived portal cookie. Codes arrive by POST, access tokens stay in memory
and pass the existing resource JWT verifier, and authenticated replay storage
prevents a second session from the same transaction. Each callback request
attempts at most one exchange; a replay may attempt an exchange but cannot issue
another session. There is no automatic exchange retry, refresh, Organization,
invitation/enrollment, ID-token authority or inline-credential fallback. An
already-authenticated configured family member can still enter with a standard
resource bearer token. Merely viewing the anonymous entry makes no provider or
storage calls; sign-in adds bounded issuer requests, not a new paid service.

At most fifteen invited principals can be stored. Each credential validation
performs one bounded Nemlig login and one bounded authenticated read, without an
app-owned request-rate gate. Invitation registration
remain outside this owner-only recovery path. Do not enable this surface until
the reviewed browser client and session key below are provisioned and owner
acceptance is recorded. No Auth0 client, API, callback, tenant,
identity, or existing credential record is deleted by this source change.

The existing `NEMLIG_MCP_CREDENTIAL_KEY` Worker secret and fixed Durable Object
are the current secure storage design. Envelopes are AES-GCM protected and
bound to principal, policy revision, key version, and generation. Cloudflare
Secret Store was not selected as a competing store: a migration would need
separate approval for access control, provisioning, local development,
rotation, revocation, ciphertext compatibility, and rollback.

Only an explicitly configured family identity can use the credential portal.
One successful read-only validation atomically stores its sealed generation.
An existing pending record still requires its isolation/activation checks;
unknown subjects cannot enroll through a registry fallback. Failed replacement preserves the last known-good
generation. Users can replace or revoke only their own connection; the owner
portal can disable or revoke invitee access. Rotation invalidates old MCP
sessions on their next request, and revocation removes the current generation.
Status verifies a bounded read-only Nemlig request before returning `connected`.
It otherwise exposes `connection_required`, `reconnect_required`, or
`provider_unavailable` plus the fixed connection URL. A hosted OAuth/request
context alone is not evidence that Nemlig credentials work; provider failures
must not be presented as a ChatGPT/Auth0 reconnect challenge.

For rollout, keep both `MCP_ENABLED` and onboarding false, deploy the exact
CI-green revision, and verify both surfaces fail closed without Container
activity. Enable onboarding alone for owner migration, validate and store the
owner credential through the page using the current schema-v3 policy, then
enable MCP and run read-only owner acceptance. Additional configured family
members require independent isolation acceptance. If any identity, isolation,
validation or provider gate fails, disable both switches and restore the exact
previous Worker with its privately retained compatible configuration. Current
code has no old-schema or inline-credential fallback.

### Owner browser entry prerequisites

Before enabling onboarding, review one public OAuth client on the existing
issuer. Do not repurpose the ChatGPT client or introduce an auth server. Use
`token_endpoint_auth_method=none`, authorization-code-only grants, S256 PKCE,
and the exact callback `https://nemlig-mcp.broesby.dk/connect/callback` with
`response_mode=form_post`. The adapter sends the configured Auth0 API `audience`
as well as MCP `resource`; do not depend on an unverified tenant compatibility
profile. No refresh grant, `offline_access`, Organization, new enrollment or
Management API audience is needed. Confirm the existing owner can obtain the
configured API scope using this client. See Auth0's
[PKCE authorization parameters](https://auth0.com/docs/api/authentication/authorization-code-flow-with-pkce/authorize-with-pkce)
and [OAuth response modes](https://github.com/auth0/docs/blob/master/articles/protocols/oauth2/index.md).

Provision the public identifier as `NEMLIG_MCP_ONBOARDING_CLIENT_ID` and a
separate random 32-byte base64url `NEMLIG_MCP_ONBOARDING_SESSION_KEY` Worker
secret through the approved private operator path. Preserve the credential
encryption key, exact schema-v3 principal keys/revision, encrypted generations
and private rollback material. Deployment preserves the live browser identifier
and fails before mutation when enabled onboarding lacks the identifier, session
key or credential-key binding. Secret presence is not proof of valid contents.

During disabled/onboarding-only rollout, use an actual browser to verify the
cross-site POST transaction cookie, issuer Origin, clean redirect and protected
credential form.

The portal uses `Referrer-Policy: same-origin`: native form POSTs must retain
the exact site Origin while cross-origin referrers remain suppressed. Using
`no-referrer` makes a browser send `Origin: null`, which the protected POST
correctly rejects before credential validation. Never fix this by accepting
null/missing origins or disabling CSRF. After a header release, load a fresh
form instead of resubmitting the old document.

Owner sign-in itself does not validate or save Nemlig access; the owner must
explicitly use the existing credential form. Record read-only
connection validation before the separately gated enabled production release.
Neither local synthetic OAuth nor service-fixture acceptance proves this live
owner migration. Native ChatGPT acceptance remains a separate release gate.

For an incident, disable onboarding first; disable MCP too if credential
selection, principal isolation, or encryption-key integrity is uncertain.
Revoke the affected principal or credential in the owner portal, rotate the
upstream Nemlig password when upstream revocation is intended, and rotate the
encryption key if ciphertext confidentiality may be compromised. Inspect only
sanitized terminal/lifecycle events—never request bodies,
cookies, invitation links, subjects, credentials, envelopes, or provider
responses.

## Automated production release

The **Nemlig production** workflow runs after successful CI for a push to
`main`. It deploys that run's exact commit only while it is the current `main`
tip; a CI completion superseded by a later merge is recorded as skipped before
build or provider access. Re-running CI for the unchanged current tip remains
safe. Deployment credentials stay inside the protected `nemlig-production`
environment. The owner approves the pull request before merge; the successful
main-CI merge is the routine release decision.

GitHub Actions concurrency (`group: nemlig-production`, no cancellation,
queued runs) is the only release serialization. The workflow is intentionally
limited to exact-source validation, frozen dependency installation, build,
Cloudflare access checks, deploy, and bounded read-only acceptance. The deploy
command also verifies the exact CI run and protected environment, the existing
Worker configuration and single Container model, the candidate revision and
image readback, and edge plus authenticated service behavior. It never requests
an owner access token, password, or browser session, and it never prepares or
applies a proposal or mutates a basket.

There is no production lease or lock, deployment journal, recovery artifact,
predecessor cleanup, rollback, manual recovery command, or automatic image or
Worker-version pruning. A failed or cancelled run stays failed. It does not
restore or redeploy another version. Inspect the current Worker version,
Container image/version and rollout state in Cloudflare before deciding on a
separately reviewed corrective deployment. A later queued release relies on
that current provider preflight and does not wait for a saved predecessor record.

The workflow's read-only synthetic acceptance is not owner or ChatGPT UI
acceptance. UI-bearing releases still need the separate
[ChatGPT UI acceptance](nemlig-production-readiness.md#ui-release-acceptance-required-for-ui-delivery).
No image or Worker history is deleted automatically; any future cleanup needs a
separately reviewed process.

The command can be run against a trusted, green main SHA when supervised
terminal execution is needed:

```sh
pnpm --filter nemlig-assistant production:deploy -- --service CANDIDATE_COMMIT
```

This command verifies the exact checked-out SHA, current main ancestry, trusted
CI provenance, and protected environment before it asks Cloudflare to deploy.
A deployment failure is reported and returned; there is no automated restore
or durable recovery state.

Historical observation (not current delivery evidence): the latest routine
technical acceptance recorded at the time of this note completed for repository SHA
`d5e62e6d5259e50ff668d26652a977009add565d` in [protected workflow
35664402066](https://github.com/mortenbroesby/everyday-assistants/actions/runs/35664402066).
Read-only provider verification found enabled Worker version
`3c0a0cef-e011-4c09-9ed8-4c34e3da8b8a`, application version `74`, and image
`sha256:c6280f16f769c88dfcadbf731d2e514cdbb0aedc290e0b3f66b0d1b8f45e0d3b`.
This historical synthetic edge/service acceptance is not fresh production or
family acceptance evidence.

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

The dated deployment and acceptance observations below are historical evidence,
not current incident instructions or permanent live-state claims. For current
state use the exact-SHA workflow summary and fresh read-only provider
inventory; follow **Correct a failed deployment** for failures. Do not repeat
an old rollback, credential repair, or cleanup action merely because it appears
in this archive.

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

## Verify production features and read-only checks

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

The current app contract permits basket additions only. This app has no live
mutation acceptance command; it must never remove or decrease basket contents,
replace items, clear the basket, or perform an inverse basket restoration.

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
`production:test:features` when a current owner token is available.

This boundary was retained when the tunnel-retirement change was formally
closed: the automated contracts and credential-free production probe passed,
while the optional token-backed feature sweep remains an operator-run check
rather than claimed completion evidence.

## Inspect sanitized operational evidence

There are no application usage counters, quotas, daily breaker or reset endpoint.
Old usage records remain untouched and are not read or converted. Inspect only
sanitized terminal outcomes and Container lifecycle events; use the documented
manual kill switch to stop new work.

Each request emits at most one closed `gateway_request_terminal` event with
schema version, generated request ID, revision, route, method, credential-gating
category, terminal outcome, HTTP status and elapsed milliseconds. Lifecycle events
are limited to Container start/stop/error. No raw errors, headers, bodies, tokens,
cookies, OAuth artifacts, prompts, arguments or shopping data are logged.

Workers Logs remains enabled at 100% sampling for bounded investigation. The
closed schema limits event contents, not traffic or billing. The single sleeping
`lite` Container, bounded deadlines/retries and manual `MCP_ENABLED` switch
remain. No app-enforced aggregate operation or billing ceiling exists.

## Diagnose a ChatGPT reconnect without collecting secrets

Use the three evidence planes separately; the Worker cannot observe ChatGPT's
authorization UI or Auth0's browser redirect before a request reaches it.

1. Record the UTC start time, the ChatGPT app identity and its configured
   production `/mcp` URL. During the Rejoin reset, use
   `Nemlig Assistant (Rejoin)` and record the prior app separately.
2. Refresh the current app's metadata in place. Record only completion time and
   whether `/healthz`, `/revision`, and OAuth protected-resource metadata passed,
   including revision and per-step latency from `production:probe`.
3. Start one bounded OAuth reconnect. In Auth0, record only timestamp and a
   non-secret event category such as login success, consent failure, token
   exchange failure, or no event observed. Never copy credentials, access or
   refresh tokens, authorization codes, OAuth state, callback URLs with query
   values, or raw event payloads.
   Use ChatGPT's **Reconnect** setting or the `Reconnect Nemlig Assistant`
   action. The public gateway returns the OAuth resource challenge on missing
   or invalid tokens so ChatGPT can prompt automatically instead of disabling
   the app without a recovery path.
4. Search Worker logs in that same time window. Record only terminal outcome,
   correlation ID, revision, route, status, and elapsed time. If there is no
   Worker event, the last completed boundary is before the Worker—ChatGPT app
   state, browser authorization, or Auth0—not the Container or Nemlig.
   An `authentication_rejected` outcome is a token or principal decision and
   may justify reconnect investigation. `authentication_timeout` or
   `authentication_unavailable` is an Auth0 discovery/JWKS infrastructure
   failure; it must not be reported as a request to replace credentials.
   `backend_rejected` with HTTP 400 means an authenticated request reached the
   Container but its MCP handshake or request was rejected. Inspect the MCP
   protocol version and supported transport before changing Auth0 credentials.
5. After reconnect succeeds, open two fresh normal ChatGPT conversations. In
   each, check the connection and request at most one favorite. Record only pass
   or fail, timestamps, and Worker correlation IDs; do not record returned
   private data. Do not create/edit lists, prepare/apply proposals, submit a
   feature request, or mutate the basket.

## Rotate secrets

### Create or rotate the private principal policy

Only schema v3 is accepted: `schema_version`, `revision`, `owner_subject` and
`principals` entries with `subject`, `principal_key` and `enabled`. The owner
must identify exactly one enabled configured member. No tiers, budgets, inline
passwords, legacy versions or automatic unknown-identity enrollment exist.
Do not put the real policy in a command argument, environment file, repository file,
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

4. Keep production disabled while validating the new revision, explicit enabled
   owner, configured identities, anonymous rejection, and unknown-principal
   denial. Enable the same application revision only after those checks pass,
   then run bounded owner read-only acceptance.
5. If validation or acceptance fails, restore the recorded prior policy through
   the same hidden prompt and restore the exact prior Worker version. If either
   state is uncertain, leave the MCP disabled.

Changing Cloudflare's copy does not revoke an old Nemlig password. Rotate the
upstream credential when revocation is intended. After an owner-only migration
is accepted, remove the three legacy owner secrets in a separate disabled-first
rotation; they are not needed for runtime lookup.

### Stage and later enable an invitee

An invitee is a separate principal and Nemlig account, never an alias for the
family account. Stage its exact subject and opaque key in the private current
policy, disabled until isolated acceptance. Each identity uses only its own
encrypted credentials. A disabled or unknown identity is denied before backend
work; a stored record alone never grants admission.

Before changing that entry to `enabled: true`, perform a separately approved
two-account read-only isolation exercise: each identity must see only its own
favorites and basket; guessed session and proposal references from the other
account must return the same non-sensitive
denial. No usage tier or per-person budget applies. Record only pass/fail,
policy revision, sanitized denial reasons and correlation IDs. Do not record subjects, opaque keys,
credentials, returned shopping data, or per-principal counts.

If any identity, credential or state boundary is uncertain, keep
the invitee disabled and restore the last verified policy. Invitee activation
does not authorize a basket mutation.

## Correct a failed deployment

There is no automated rollback or recovery workflow. Before changing
production after a failed or interrupted release, inspect the live Worker,
Container image/application version, rollout state, and read-only edge behavior
in Cloudflare. Do not infer the active state from the workflow result alone.
Choose a corrective deployment only after the actual state and target revision
are understood and reviewed. Emergency disable remains a separate manual
containment action.

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
traffic, external rate limits, large Worker log volume, or a
Container that does not sleep after 10 minutes. The architectural ceiling is one
`lite` Container; authenticated activity, Worker requests, logs, egress, other
Cloudflare account workloads, Auth0, GitHub, domain, and Nemlig costs can still
add charges. Budget alerts do not stop usage.

## Family-only configuration boundary (5.0.0)

Before a separately authorized release, stage only the current schema-v3 policy
above. Preserve exact identity/key and encrypted credential revision/generation
bindings. Old versions and removed fields fail closed without conversion. Keep
private prior-code-compatible rollback material. Do not publish or migrate real
credentials/configuration in a repository PR.

Remove all former `MCP_RATE_LIMIT`, `MCP_EXPENSIVE_RATE_LIMIT`,
`MCP_CREDENTIAL_RATE_LIMIT`, `MCP_CREDENTIAL_GLOBAL_RATE_LIMIT`,
`MCP_DAILY_LIMIT` and `MCP_EXPENSIVE_DAILY_LIMIT` bindings before release.
New candidates omit them and stale deployment bindings fail validation. Existing
stored usage is neither read nor deleted. There is no count-based app limit and
no hard billing cap: runaway authenticated traffic can keep generating provider,
logging and storage cost until stopped. External provider/platform limits remain.

Consumed CSRF hashes remain until signed expiry, with expired entries removed
on the next action. Replay storage grows during that 15-minute lifetime and
storage failures deny before provider work; no cleanup polling is introduced.
