# Cloudflare operations for Nemlig MCP

Production state is time-sensitive. Verify the current workflow journal,
Worker, routes and Container before any operation; historical version IDs and
acceptance below are not current-state proof. On 2026-09-27, [recovery run
36320068876](https://github.com/mortenbroesby/everyday-assistants/actions/runs/36320068876)
restored the last accepted source SHA `94a9a3c` after the `476dd92` service
fixture failed and its fail-closed rollback returned both MCP routes to 503.
The recovery deploy passed edge and service acceptance; live route readback
showed 401 for anonymous MCP requests, and a fresh ChatGPT conversation
completed profile, sections, and catalogue reads without basket writes.
The run's separate post-deploy image-retention job failed; do not infer
retention completion or rerun cleanup from the successful deploy. Preserve
the `476dd92` fixture failure as unresolved until its precise inventory or
transport boundary is proven. Before any further recovery, establish that
the prior runner stopped and the exact Worker/Container state is safe.
Read-only reconciliation of the saved recovery journal and current ledger
reproduced `image_retention_ledger_commit_conflict`: recovery rebuilt the same
`94a9a3c` source into a different accepted image. A distinct acceptance time
is now part of the ledger event identity; this code change does not itself
reconcile the live interrupted retention lease or prove cleanup completion.

Production endpoints:

- `https://nemlig-mcp.broesby.dk/mcp`
- `https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp`

Both returned HTTP 503 with `MCP temporarily disabled` during the latest
read-only incident verification. The Worker is
`nemlig-mcp-cloudflare-production`; the configured Container is `lite`, EU
placed, sleeps after 10 minutes, and is capped at one instance. The currently
served policy is not asserted by this source update. Current code accepts only
schema v3: revision, explicit owner subject and configured enabled family
identities/opaque keys. Sealed credential records
remain in the existing fixed controller Durable Object. The authenticated
`get_profile` operation is intentionally provider-independent and does not
require a Nemlig credential; provider-backed operations remain credential-gated.
This document records
field names only, never values.

## Production shape and defaults

The repository deploys one Worker, one fixed EU Container-controller Durable
Object named `nemlig-production`, and at most one sleeping `lite` Container. The
legacy `PlanStorage` class, namespace binding and migration history are retained
only to preserve existing records and rollback: its handler returns 410 without
storage access, and the application no longer forwards saved-shopping requests.
Do not delete that namespace or stored records as part of a routine deployment. The Worker
is disabled by default. No app-local operation quota, rate throttle, tier budget,
usage counter or automatic daily breaker remains. Protocol/profile distinctions
serve only credential gating and diagnostics. The manual kill switch still
stops new MCP work before backend access.

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

   Configure the private ChatGPT app with the production `/mcp` URL, OAuth with
   Dynamic Client Registration, and the default `use:nemlig-assistant` scope.
   The current recovery app is `Nemlig Assistant (Rejoin)`. Confirm its
   connection reports OAuth and returns an authenticated `get_profile` result.
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

Routine releases use the **Nemlig production** workflow with the exact SHA from
a successful trusted CI run, provided that SHA remains in current `main`
history. The workflow does
not require a semantic-version bump, codename allocation, release-note file, or
GitHub prerelease. The package's human-facing codename metadata remains part of
the runtime identity for now, but it is not deployment eligibility or provider
authority.

The owner approves the pull request before merge. A successful push to `main`
then enters the protected production environment automatically; that merge is
the routine human release decision. The workflow keeps the safety boundary in
the privileged job: exact-SHA checkout, frozen install, pinned actions,
queued serialized execution, bounded timeouts, protected credentials, one-Container
limits, effective configuration checks, revision readback, and read-only edge
and service acceptance. It never requests an owner access token, password, or
browser session.

Historical observation (not current delivery evidence): the latest routine
technical acceptance recorded at the time of this note completed for repository SHA
`d5e62e6d5259e50ff668d26652a977009add565d` in [protected workflow
35664402066](https://github.com/mortenbroesby/everyday-assistants/actions/runs/35664402066).
Read-only provider verification found enabled Worker version
`3c0a0cef-e011-4c09-9ed8-4c34e3da8b8a`, application version `74`, and image
`sha256:c6280f16f769c88dfcadbf731d2e514cdbb0aedc290e0b3f66b0d1b8f45e0d3b`.
The edge probe passed health, revision, OAuth metadata, anonymous rejection,
and foreign-origin rejection. This is synthetic technical and edge acceptance,
not a fresh real-family Nemlig or ChatGPT acceptance claim.

### Repeatable release

1. Merge an approved change only after its required CI is green. Each eligible
   successful main-CI run queues the exact tested SHA; it does not substitute a
   later tip SHA. A later unaccepted main tip does not strand that candidate
   while it remains in current main history.
2. Credential-free preflight rechecks the repository, exact CI provenance,
   that the candidate is still an ancestor of current `main`, and the protected
   environment before the privileged job. A candidate already superseded by a
   deployed descendant stops before provider mutation.
3. The protected job builds and deploys the exact SHA, records the bounded
   report and journal, runs the configured edge/service acceptance, and
   automatically finalizes a known terminal routine run after the artifact is
   saved. An uncertain state, failed artifact, or provider drift keeps
   recovery ownership for explicit inspection. UI-bearing releases also require
   [ChatGPT UI acceptance](nemlig-production-readiness.md#ui-release-acceptance-required-for-ui-delivery)
   before being reported delivered; the workflow cannot refresh the owner's
   installed ChatGPT app metadata.
4. Routine delivery starts automatically after successful CI. Manual dispatch
   is reserved for recovery to a previously green `main` ancestor or for
   reconciling one explicitly identified pending rollback. GitHub's
   native concurrency queue retains at most 100 pending runs and orders them by
   when they began waiting, not by source-event dispatch time. There is no
   hourly catch-up job, durable delivery queue, or automatic replay layer; this
   rare platform queue limit is accepted rather than adding custom machinery.
   If GitHub rejects a run at that limit, use the protected recovery workflow
   for the current green `main` SHA after confirming the queued deploy state.

   ```sh
   git fetch origin main
   sha=$(git rev-parse origin/main)
   gh workflow run nemlig-production.yml --ref main -f commit="$sha" -f recovery=true
   ```

   If the saved release artifact and original-runner-stopped evidence are
   available, a protected reconciliation dispatch can prove the exact disabled
   Worker/Container state, append the missing transition result, and then
   release the lease without deploying again:

   ```sh
   gh workflow run nemlig-production.yml --ref main \
     -f commit="$sha" -f recovery=true -f reconcile_operation="$operation"
   ```

   If the saved journal contains only an `enable_deploy` intent, protected
   reconciliation first requires exact readback of that candidate Worker and
   the unchanged, inactive starting Container. Only then may it journal and
   roll back to the recorded starting Worker; it must verify both public routes
   are disabled and the Container remains unchanged/inactive before finalizing.
   Drift or an uncertain rollback keeps the lease; the recovery path never
   retries the rollback.

   If the saved journal contains only a `disabled_deploy` intent after a
   disabled-route probe failure, reconciliation can close the operation only
   when the current Worker is the exact disabled candidate SHA, its versioned
   registry tag resolves to the exact current Container image, configuration
   and Container identity match the journal, the Container is inactive, and
   both routes return the fixed disabled response. It appends the missing
   disabled result without deploying or rolling back; any mismatch retains the
   lease. Deployment checks both public routes as a pair up to six times with
   five-second spacing to tolerate transient edge propagation, and fail closed
   after that bounded window.

5. If the run is canceled, fails, or leaves a lease, download its artifact and
   run `inspect-recovery` with that artifact's operation UUID. Continue only
   when inspection proves a terminal matching state; never retry the deployment
   or delete the lease based on its age.

The shared command also supports supervised terminal execution with those same scoped CI credentials:

```sh
pnpm --filter nemlig-assistant production:deploy -- preflight CANDIDATE_COMMIT
pnpm --filter nemlig-assistant production:deploy -- --service CANDIDATE_COMMIT
```

Routine service acceptance is part of the automatic workflow; there is no
manual cutover or finalization mode. Recovery remains explicit and accepts only
a previously green ancestor of current `main`.

The command verifies local HEAD, refreshed remote `main` ancestry, exact-head CI, and the
required main-only environment before issuing one bounded machine token or
changing Cloudflare. Token validation checks signature, issuer, audience, exact
identity/scope and remaining expiry. Fixture checks prove runtime transport and
isolation; they do not prove live Nemlig or ChatGPT behavior.
It takes an exclusive lock shared by linked worktrees and atomically creates
`refs/heads/codex-lock/nemlig-production` for a unique operation UUID, not the
source SHA. The ref contains a bounded public-safe recovery journal. Releases
keep `MCP_ENABLED=true` while Wrangler activates the new Worker and rolls the
Container image. If a candidate fails bounded acceptance after rollout,
recovery deploys the same image with `MCP_ENABLED=false` and no second Container
rollout. The MCP HTTP transport is stateless: modern clients do not depend on
session IDs, and production acceptance does not probe obsolete session-recovery
behavior. The journal records the starting version, the exact enabled transition, the resulting Container image, and the bounded edge and
authenticated read-only checks.
During a routine rollout, the machine fixture first compares the release version
reported by its authenticated MCP connection with the checked-out candidate.
A previous backend release is retried within a fixed 17-minute maximum, capped
earlier to leave five minutes of the operation deadline for rollback. Other
fixture failures keep their shorter retry budget. A passing fixture must also
have one running instance at the candidate application version; a configured
image or inactive instance alone is not acceptance. This check does not restart
or force-replace a Container, and its synthetic reads do not prove ChatGPT UI
rendering or owner shopping acceptance.
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
non-cancelled completed deploy invokes exact-state finalization automatically,
including a failed release whose rollback is verified. The saved journal must
match the candidate SHA, workflow run ID and attempt. Finalization alone decides
whether the state is terminal; successful lease release does not turn a failed
deployment into acceptance or authorize retention. An uncertain
operation, failed artifact upload, pending intent, unknown state or drift retains
both leases for explicit inspection and finalization. Finalization requires the exact operation UUID,
complete terminal evidence, matching current Worker/configuration/application/instance and unchanged remote
journal head. Missing evidence, pending intent, unknown state or drift blocks
cleanup. A legacy source-SHA lease also blocks new releases; never steal it or
delete it on an age/TTL assumption.

```sh
pnpm --filter nemlig-assistant production:deploy -- inspect-recovery OPERATION_UUID
# Only after independently confirming the original runner has stopped:
pnpm --filter nemlig-assistant production:deploy -- inspect-recovery OPERATION_UUID --original-runner-stopped
# Only after saving the complete artifact and confirming the original runner stopped:
pnpm --filter nemlig-assistant production:deploy -- reconcile-recovery OPERATION_UUID --evidence-saved --original-runner-stopped
# Only after saving complete final evidence and reconciling the exact state:
pnpm --filter nemlig-assistant production:deploy -- finalize OPERATION_UUID --evidence-saved --original-runner-stopped
```

Reconciliation is narrower than deployment: it accepts only the explicitly
supported interrupted phases when current Worker, configuration, registry
image, application version, inactive instance and both disabled routes match
exactly. It appends the observed terminal result to the remote journal; it
never deploys, rolls back, or changes a Container.

Inspection is read-only and uses four bounded Worker/Container metadata reads;
for a disabled target it also confirms both public routes still return the fixed
503 response. A stopped-runner attestation cannot make pending or unknown work
cleanup-eligible. Do not rerun an uncertain release or manually continue its upload steps. GitHub ref deletion has
no compare-and-swap parameter: the final read/delete pair cannot fence an
out-of-protocol actor replacing the ref in that interval. All release clients
must honor the no-steal rule.

Both inspection and finalization require the applicable recorded application
version, configuration digest and starting enabled flag. Old or incomplete journals remain readable but
cannot authorize cleanup. Enabled recovery permits the fixed inactive assignment
or one matching running instance; disabled recovery requires both public routes
to remain disabled and the Container instance to be inactive. Neither
operation wakes or polls a Container. Finalization independently requires both
evidence-saved and stopped-runner attestations, then rechecks the remote head.
Rollback and failure recovery also verify configuration, image, application
version and instance state before claiming a known result. A Worker-only rollback
is not proof of image restoration. These local safeguards do not authorize a
production mutation.

Wrangler's Container list can lag an active rollout. Use
`wrangler containers list --env production --json` only to discover the single
application ID, then use `wrangler containers info APPLICATION_ID --env production --json`
for authoritative image and application-version reads. Match that version to
the single accepted instance before reporting convergence.

The production workflow runs image retention immediately after exact runtime
acceptance. It requires two identical complete inventory/reference snapshots in
that run, then deletes safe surplus tags from the exact production registry
repository one at a time, rechecking active/recovery references and the
tag-to-digest mapping before each delete and requiring fresh inventory readback
afterward. Registry layer garbage collection and ledger completion happen only
after the plan is satisfied. Uncertain results stop for an explicit resume; they
do not trigger a blind retry, deployment rollback, or kill-switch change. The
The operation also inspects Container instance versions before planning: active
instances must match the current application version, and provisioning,
stopping, mixed-version, or otherwise unknown states hold cleanup.

Cleanup claims the same `codex-lock/nemlig-production` ref used by production
deployments, so local supervised deploys and post-deploy pruning cannot overlap.
Each tag deletion first records a durable in-flight tag/digest intent. If a
runner disappears, the next operation may reclaim only a retention-owned lock
whose prior GitHub run is complete; it reads the registry before continuing.
An absent tag resolves the old intent, while a still-present tag remains
uncertain and is never blindly deleted again. A deployment-owned or malformed
lock is not taken over.

The retention job uses short-lived pull credentials for inventory and requests
push credentials only after the two snapshots match and deletion begins. A
GitHub ledger branch records accepted releases and cleanup checkpoints.
`NEMLIG_CONTAINER_IMAGE_RETENTION_COUNT` defaults to 10 distinct accepted
images. If cleanup is interrupted or uncertain, use the protected workflow's
`resume_retention` input with the accepted commit SHA after the previous run has
finished; the operation re-reads current state before continuing. The job does
not remove Worker deployments/versions, secrets, Durable Object state, Container
applications, or any other registry repository. Deployment still keeps the
existing one `lite` Container and bounded-work safeguards; image pruning does not add
runtime capacity or perform basket/order/payment/delivery operations.

The workflow summary separates deployment, technical acceptance, owner
acceptance, retention cleanup, and traffic measurement. Owner acceptance is
always reported as not run by CI, and configured routing is not presented as
measured request traffic. Cleanup is `complete` only when the retention report
proves completion; protected or untracked images are reported as
`held/incomplete` with their safe reasons and digests. A missing retention
report, dry run, unstable inventory, failed operation, or uncertain delete is
reported separately and preserves the non-zero retention exit status. A
missing `retention-ledger.json` fails closed when the ledger branch already
exists; only a branch created by the current run may initialize an empty ledger.

Worker-version retention is a separate policy from Container-image retention.
After a successful image-retention stage, the protected workflow takes the
same `codex-lock/nemlig-production` lease, lists every production Worker
version through the paginated Cloudflare API, calculates a fixed UTC cutoff of
48 hours, and considers only older versions for deletion. The current serving
version and recovery references derived from the exact deployment journal are
always protected; operator-supplied recovery IDs require explicit reviewed
resume evidence. Each deletion records a bounded durable Worker report before
and after the provider request, is revalidated against a fresh complete list,
and must be absent on readback. An uncertain response holds the lease and
stops without a blind retry; use the protected workflow's
`resume_worker_retention` input only after reconciling the durable report and
provider state. The one-time historical cleanup is not evidence that this
policy has run, and no Worker-version deletion is authorized by local tests
alone.

### Configuration and recovery disposition

The current production binding inventory is intentionally small. Active
runtime consumers are `MCP_ENABLED`, timeout variables, the Auth0
issuer/audience and public URL, the service-acceptance identity, the credential
key version, `NEMLIG_MCP_PRINCIPALS`, and the `NEMLIG_MCP_CONTAINER` and
`NEMLIG_PLAN_STORAGE` Durable Object bindings. The HTTP host/port values are
consumed by the Container auth bootstrap and are validated even though the
Worker supplies the fixed production values. `PlanStorage` is dormant for
current shopping behavior but retained for schema/tombstone compatibility and
rollback; its removal is not part of deployment cleanup.

`MCP_MINIMAL_AUTH_ENABLED` and `NEMLIG_MCP_AUTH_CANARY` are legacy dashboard
bindings: the exact production deploy removes them from the active plaintext
configuration and tests reject their redeployment. Encrypted principal data,
the credential-key binding, Durable Object migrations, and rollback material
remain required. The deployment lease, remote journal, local artifact mirror,
and retention lease are all still consumed by runner-loss recovery; their
ownership and readback checks are not redundant and must not be replaced by
age or TTL decisions.

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
state use the exact-SHA workflow summary, fresh read-only provider inventory,
and the recovery procedures above; do not repeat an old rollback, credential
repair, or cleanup action merely because it appears in this archive.

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

## Roll back

Disable first. In Cloudflare Deployments, select the last recorded verified
deployment and roll it back, or redeploy its exact Git commit with:

```sh
git switch --detach VERIFIED_COMMIT
pnpm install --frozen-lockfile
pnpm --filter nemlig-assistant cloudflare:check
pnpm --filter nemlig-assistant exec wrangler deploy --env production
```

Keep `MCP_ENABLED=false` until the rolled-back revision, its compatible private
configuration, Auth0 rejection and read-only flow are verified. Never roll back
by weakening authorization or creating another Container.

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
