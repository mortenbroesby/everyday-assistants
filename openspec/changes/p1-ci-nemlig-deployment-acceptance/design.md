## Context

Planning baseline: `775b1fffaee74f3792661d45046f84b3cd60bea0`, refreshed `origin/main`, clean isolated worktree `codex/plan-ci-nemlig-acceptance`. P1 is justified by repeated production acceptance blocking while release code already exists; this is delivery reliability, not an incident or a rewrite.

User brief: determine whether CI needs an Auth0 CI user; produce a detailed Astra plan; have Sol resolve uncertainty and coordinate bounded Terra implementation and Luna verification. Repository implementation is already requested after planning. Provider/secret setup and live release remain separately reviewable checkpoints. Do not ask again for ordinary repository work.

### Verified repository evidence

| Evidence at baseline | Consequence |
| --- | --- |
| `scripts/production-deploy.ts:326` requires token presence before source/provider work; `verifySource` checks latest named CI run's SHA/status; remote lease stores source SHA; journal is local | Presence is not validity, CI trust provenance is incomplete, same-SHA runs lack unique ownership, ephemeral CI loses recovery detail |
| `deployProduction` builds disabled, probes both routes, checks inactive Container, enables with `--containers-rollout none`, compares image strings | Reuse the command; retain and strengthen its current assertions |
| Failure handler can roll back when an enabled current version differs from the start, including unexpected external drift; no ownership guard immediately protects recovery | Characterize and fix before CI: never overwrite a third-party deployment during rollback |
| `src/auth0.ts:78` verifies RS256, issuer, audience, subject, scope; `cloudflare-worker.ts:318` then resolves static/enrolled principal | Valid machine JWT alone is insufficient for acceptance; never translate its subject to owner |
| `src/http.ts:95` requires principal credentials, including sealed-generation checks for schema v2; `PrincipalContextFactory` exists | No production fixture identity exists; a fixture feature is a deliberate trust-boundary change, not a config-only token addition |
| `src/cloudflare-gateway.ts:283` denies admin to non-Tier-0; acceptance helper always calls `/admin/usage` | Split owner-admin evidence from service/user feature evidence; do not grant CI Tier 0 |
| `src/production-acceptance.ts:109` has bounded live reads; reports missing saved-plan/list fixtures as unavailable | Preserve unavailable results; a passing sweep is not every feature exercised |
| `wrangler.jsonc` has `keep_vars:true`, default disabled switches, one EU `lite` Container, two fixed DO bindings, fixed cost controls | Deploy only the existing topology; compare critical effective bindings before/after |
| `.github/workflows/ci.yml` uses full-SHA actions, read-only permissions, frozen install, Node 22.23.1/pnpm 9.15.9, production-readiness gate | Reuse toolchain and credential-free verification; do not put secrets into PR CI |

Coordinator read-only provider inventory: repository PUBLIC, default `main`, no GitHub environments, no repository secrets; host `gh` and Wrangler authenticated. Absence of a saved owner token is known. No Auth0 client/grant, Cloudflare CI token, provider configuration, or current production reinspection was performed in this planning worktree. The runbook's last verified production revision is `7566d1eec1b435b86ef86afc50c45c14ffd8c9cd`; treat it as recorded historical evidence until refreshed.

`automate-nemlig-production-deployment` is 11/13 and `p2-simplify-nemlig-maintenance` is 48/50 at baseline. Their live rollout and archive tasks remain open. The new capability adds CI-specific requirements without competing hosting deltas. Do not archive either predecessor on synthetic evidence or silently rewrite its live acceptance criteria.

## Goals / Non-Goals

**Goals:** reuse the actual command and acceptance seams, establish trusted source and durable recovery before adding unattended credentials, and report exactly which execution path passed. A production fixture path must share real JWT validation, request classification, admission, HTTP transport, and MCP implementation while replacing only account/provider data and removing writes.

**Non-goals:** arbitrary target URLs, dynamic test identities, arbitrary fixture upload, a general token broker, automated tenant administration, owner impersonation, new staging infrastructure, paid runners, autoscaling, or automatic completion of real-client acceptance.

## Decisions

2026-09-09 continuation: the owner answered the recommendation to use synthetic checks for routine releases, retaining real-user checks for first cutover and relevant behavior changes, with “Go ahead with remaining.” D1's release-evidence matrix is accepted. This does not approve new credentials, paid allowances, provider setup or production activation; D2–D4 remain pending their concrete inventory/checkpoint. The root thread coordinates at the owner's request, with Sol used only for bounded planning unknowns and Terra/Luna for implementation/review.

Concurrent scope reconciliation: the product-simplification lane reports explicit owner approval to remove saved shopping plans and named lists. CI must preserve that removal: synthetic fixtures cover catalogue, favorites, basket and resource reads only, with same-conversation planning tested offline where appropriate. No saved-shopping storage dependency, fixture, advertised tool or acceptance call may be restored. References below to denying human stored data remain isolation requirements, not requirements to keep the removed feature alive. Historical baseline observations above remain historical.

### 1. Identity recommendation and evidence contract

CI deployment authenticates to Cloudflare; API acceptance authenticates to Auth0. These are independent credentials. Recommend a dedicated Auth0 M2M application with only a new service-acceptance scope and exact synthetic service subject/client binding, no Management API grant, and no normal user API grant. Obtain one short-lived token per explicitly dispatched acceptance run. An M2M application is not a user [S1]. Use the canonical production issuer/audience with an additional service scope and exact client/subject checks; ordinary `use:nemlig-assistant` scope must not grant fixture admission by itself.

This recommendation is **selected for the proposed implementation**, disabled by default. Sol may implement identity-independent packets immediately. Before delegating runtime identity work, resolve D1 and D2 below with the owner: the service result intentionally excludes live Nemlig and ChatGPT OAuth proof, and new Auth0 application/cost setup needs authority. A different owner choice requires revising this design, specs, and affected packets first. Do not carry contradictory optional implementations into code.

| Approach | What it proves | Limitation / decision |
| --- | --- | --- |
| M2M plus isolated synthetic service identity (recommended) | Real Auth0 token issuance/verification, edge admission, Container/HTTP/MCP contract and isolated fixtures | Does not prove user login, consent, DCR/PKCE, real Nemlig credentials, live catalogue, or ChatGPT UI; needs a new explicitly restricted runtime identity |
| Dedicated synthetic Auth0 user plus isolated real Nemlig account | User-delegated token and live provider read path for that account | Requires authorized separate accounts/data; current user principal can reach writes unless restricted; never enroll it as owner |
| Renewable delegated session for that synthetic user | Repeatable delegated API acceptance after initial authorization | Refresh rotation invalidates the old token and requires atomic durable successor storage; still does not repeat login/consent/ChatGPT UI [S2] |
| Real owner session / existing ChatGPT app | Actual user's OAuth and product experience | Keep bounded, explicitly requested owner acceptance; no CI password, browser-cookie export, or owner refresh token |
| Anonymous edge probes only | Availability, metadata, revision and cheap rejection | Insufficient as authenticated acceptance; cannot replace it by renaming the result |

The selected release policy eliminates an owner token from routine CI deployment after an accepted cutover. Sol classifies the release from its actual diff, not an unchecked dispatch switch:

| Release class | Required promotion evidence | Separate completion obligation |
| --- | --- | --- |
| Initial CI/synthetic cutover and already pending P2/predecessor rollout | Full repository gate, exact edge/image and service checks, approved bounded live-user check | Existing-app real ChatGPT check and each predecessor's explicit live criteria remain required before closure |
| Routine behavior-preserving release after cutover | Exact trusted CI, disabled/inactive checks, same image, edge and machine-authenticated service-fixture checks | No owner token or fresh ChatGPT login per release; report last real-user evidence date/SHA without claiming freshness |
| Auth, principal isolation, onboarding, OAuth metadata, MCP client contract, credential/provider integration change | Routine gates plus approved real-user/provider checks for affected boundary | Actual existing-app OAuth/ChatGPT check for client-facing auth changes; no synthetic substitution |

Repository tooling must enforce the class through reviewed release policy/changed-path evidence and fail closed on unknown scope. Until cutover evidence is recorded, selecting routine mode is rejected. This is an explicit new policy, not a retrospective waiver of predecessor acceptance. If D1 rejects this separation, Sol revises affected packets before enabling CI. A one-shot user token may support the supervised cutover if valid for the bounded release, but never becomes the unattended credential strategy.

### 2. Minimal synthetic runtime boundary, only after readiness

Use existing `PrincipalContextFactory` and `ShoppingClient` seams rather than a second MCP server or proxy. Add one statically configured synthetic identity, disabled by default, with its own opaque principal key, reserved context and immutable in-memory catalogue/favorites/basket fixtures. It is not Tier 0 and does not consume or impersonate any of the fifteen invited-human slots. Reuse the existing admission controller and guest budget ceiling; it must not draw the family reserve or increase any quota. A fixed small service rate/request budget (proposed 20 calls per accepted sweep, one sweep per release) additionally bounds it.

Validate the signed issuer, audience, expiry, required service scope, exact subject and authorized client at the edge and again in the Container. A request parameter, header, claimed tier, or normal user's token cannot select fixtures. Explicitly strip client-supplied internal principal/credential headers. Invalid/unknown/disabled identity is denied before usage state or wake; valid synthetic requests use normal admission/breaker checks before Container work.

Service requests cannot resolve a real credential, decrypt an envelope, load owner lists/plans/proposals, call onboarding, or instantiate `NemligClient`. Their allowlist covers protocol discovery, the picker resource, and only the read-only operations needed for the immutable fixture sweep. Deny every prepare/apply tool, auto-shopping tool, saved-list write, feedback/issue creation, admin/reset, and unknown operation at both trust boundaries. Do not rely on MCP `readOnlyHint`, tool names containing “show”, or the test script's good behavior. Fixture basket/favorites/list/product responses remain synthetic; plan IDs from users and other identities are rejected. No fixture write or cleanup is necessary.

Keep the ordinary user's closed tool inventory unchanged. The service profile expects its deliberately smaller advertised inventory and also tests forbidden direct calls. Default-disabled configuration must cause no behavior change for existing owner/schema-v1 or onboarding/schema-v2 paths. Do not enable onboarding or migrate policy just to create the test identity. Sol must trace full Worker→controller→HTTP→MCP credential construction and imports before handing Terra the exact file set; evidence already proves this is more than adding an allowlist entry.

### 3. Separate acceptance profiles and output

Reuse existing acceptance helpers with explicit closed profiles: `edge`, `service-fixture`, and existing `live-user`; retain owner aggregate-admin verification as a distinct result. Preserve the existing default owner behavior until migration is explicit. CI cannot choose `mutation` or pass arbitrary tool names/URLs. It must reject mutation approval environment variables rather than inherit them accidentally.

Return an allowlisted structured report: schema, full source SHA, Worker version, image digest where observed, UTC start/end, profile, required checks, passed/failed/unavailable checks, last completed boundary, fixed failure category, and correlation IDs. Never include tool results, subjects/client secrets, cookies, credential envelopes, raw assertions/errors, request headers/bodies, basket fingerprints, or private account state. Assertion libraries can print compared objects; sanitize at the top-level entry point and test hostile payloads.

One 90-second end-to-end acceptance deadline includes edge, token authentication, MCP connect, feature calls, optional admin call and transport cleanup; the current per-helper budgets are not a total operation deadline. Abort network work when deadline expires; `Promise.race` alone does not cancel underlying requests. Fixed request count and no retry on token issuance/uncertain mutations; existing bounded provider-read retry remains unchanged. Live catalogue assertions use current returned IDs and schemas rather than price/stock snapshots. A provider outage fails live acceptance but does not fabricate a product regression diagnosis.

Real ChatGPT evidence remains a separate explicitly observed reconnect/refresh of the single existing `Nemlig Assistant` app, followed by bounded read-only calls. A background handoff previously did not start a turn. An OpenAI API remote-MCP call would be another client and must not be labeled ChatGPT UI proof. For OAuth/client changes require this evidence before marking release acceptance complete; never poll an assumed chat job or create duplicate apps.

### 4. Trusted, manually dispatched CI

One `workflow_dispatch` release workflow, exact 40-character SHA input, fixed production target, one deployment job, `concurrency` fixed to production with `cancel-in-progress:false`. No push, schedule, PR, `pull_request_target`, or privilege-upgrading `workflow_run` path. Public PR CI stays read-only and credential-free; do not consume its artifacts/caches as trusted executable release input.

Before secrets or checkout of candidate code, a credential-free preflight validates event, repository identity, `refs/heads/main`, workflow identity, SHA shape, current remote main and the successful trusted CI run (workflow ID/path, push event, repository, main branch, exact SHA, completed successful conclusion and required jobs). Revalidate after environment approval and immediately before mutation; approval can wait while main advances. Use environment branch rule exact `main`, not “protected branches only” with unknown branch protection [S5]. Every third-party action stays full-SHA pinned; checkout uses `persist-credentials:false`; install frozen dependencies without deployment/acceptance credentials. Only the invoking command step receives each required credential, and only token-issuance work receives the Auth0 client secret.

Production environment secrets are not equivalent to a protected environment: referencing a missing environment can create an unprotected one [S4]. Require an explicit setup marker and verify environment metadata/protections before release. Initial required reviewer is owner, no admin bypass; permit self-review for a solo owner who dispatches, or name a second available reviewer before enabling prevent-self-review. Do not configure an impossible approval loop. Exact reviewer/bypass/dispatch policy is D3.

Job permissions: `actions:read` for CI evidence and `contents:write` only where the shared Git-ref journal/lease needs it; other jobs read-only. This ephemeral repository-scoped GITHUB_TOKEN is broader than the one lease ref; document residual exposure and protect main/workflow changes. Use no personal GitHub token. Add `deployments:write` only if native deployment-status records are actually selected; the initial journal design does not need it. Do not request `id-token:write` without a verified consumer.

Cloudflare's current GitHub Actions guide requires an API token/account ID for noninteractive Wrangler [S3]. No verified native GitHub OIDC exchange for these Cloudflare deployment APIs or this Auth0 tenant was found. GitHub OIDC capability alone and Auth0 `private_key_jwt` client assertions do not establish federation [S6]. Use a scoped, expiring Cloudflare CI token and Auth0 client secret unless a documented, plan-supported federation flow is proven before implementation; no custom broker.

### 5. Cross-host ownership and remotely durable journal

Keep the fixed shared ref `refs/heads/codex-lock/nemlig-production` and local common-Git-dir lock. Replace source-SHA ownership with a random release ID plus source SHA and run ID/attempt. Atomically create the ref pointing at a unique Git commit containing only a small allowlisted journal. Append each transition as a fast-forward child commit with the exact expected parent; failed update means ownership drift. Use the same protocol from laptop and CI. Old clients with source-SHA refs are incompatible/stale and must fail/reconcile, never steal.

The remote journal is the recovery source; local atomic JSON and a final Actions artifact are copies. Before each external transition, durably record intent, previous known version/image, proposed revision and expected lease owner; after readback, append the observed result. Failure to persist intent prevents mutation. Git objects in this public repository can remain available after ref deletion: write only public-safe evidence, never depend on deletion for secrecy. Bound each snapshot (proposed 8 KiB), transition count (32), and provider reads; fail closed on overflow. Reuse Node/`gh`/Git APIs, no database/service or journal framework.

A read-then-delete GitHub ref call is not a provider compare-and-delete operation. Safety depends on protocol participants never stealing/replacing a live lease, unique operation ownership, final ref verification, and manual recovery confirming the original runner and child processes are stopped. Native CI concurrency helps only CI; dashboard/other tools are not fenced. Recheck deployment IDs before every normal AND rollback mutation. If a new actor's version appears, stop and retain evidence; do not roll it back.

Cancellation/timeout can leave a Wrangler child or provider upload running after the process disappears. Register bounded best-effort termination handlers, stop/wait for child processes, but never depend on `finally`, an `always()` artifact step, or job cancellation as proof. If a command was sent and outcome is missing, mark unknown and retain lease. Reconcile the expected version/commit/image and recent deployments after original runner termination before retrying; timeout/504 can be late success. There is no automatic lease TTL or force-unlock.

### 6. Release state machine and exact image proof

Sequence: trusted SHA → valid required credentials → unique lease/journal → starting Worker/application/image/safety snapshot → disabled candidate (one Container build/upload) → both fixed 503 routes and inactive sole instance → same candidate source enabled with no Container rollout → exact Worker revision and same image digest → required bounded acceptance → terminal remote journal → owned lease release.

Validate token signature/issuer/audience/expiry/scope/client before mutation; token presence is insufficient. For enabled starting production, run the selected bounded non-writing identity preflight when authorized. For a disabled service, do not wake it to validate credentials: require cryptographic/authorization configuration evidence and fail if required acceptance viability remains unknown. Issue one M2M token at preflight with at least 27 minutes remaining validity for the bounded release; proposed provider lifetime is 30 minutes. No token reissuance or refresh retry is needed. Fix total release timeout to cover existing 600s upload + 180s inactive wait + 180s enable + 90s acceptance + 120s recovery and modest reads (proposed 25 minutes, job 30 minutes).

Record starting and candidate application ID/image digest, not only a Worker `/revision` label. Prove the pinned Wrangler `--containers-rollout none` behavior in local command inspection/fake traces and first approved live provider evidence; an identical Worker label does not prove a Container image revision. `keep_vars` preserves unspecified dashboard vars while explicit repository vars can overwrite them; secrets are separate bindings [S7]. Compare effective allowlisted safety vars, routes, DO classes, instance limits and secret **names/types only**. Preserve current onboarding enablement and owner-managed fields intentionally; do not accidentally replay default-false onboarding or stale vars when deploying new code. Any material config drift or capacity mismatch blocks enablement.

Acceptance failure while our known candidate owns production permits bounded rollback to recorded starting state; verify both Worker and Container image compatibility and resulting routes. A Worker version rollback does not by itself prove Container image restoration or undo DO data migrations. If exact starting image/state cannot be restored safely, retain a verified disabled candidate or unknown state, lease and failure report. No schema/data migrations are introduced by this epic. A passing edge check alone never turns rollback into success.

## Risks / Trade-offs

- [A production fixture path becomes an auth bypass] → exact signed machine identity, default off, real validation/admission, dual-boundary denial, immutable fixtures, no real credentials/provider access, negative isolation tests.
- [Passing fixtures hides live account/provider or ChatGPT failure] → separate required evidence policy and historical rollout checkboxes; first cutover/live obligations remain required and routine service promotion remains disabled pending D1.
- [CI secret compromise grants account-wide Worker access] → smallest supported account/zone permissions, expiry, protected workflow/environment, no owner secrets, explicit residual scope accepted at setup. Do not claim provider token is Worker-specific without proof.
- [Hosted runner disappears] → remote intent before mutation, retained lease, no TTL stealing; artifact upload is supplemental.
- [Refresh token rotation races or successor loss] → reject static-secret refresh loop. Alternative needs one serialized secure writer, atomic encrypted successor persistence before success, ambiguous exchange fail-stop and interactive recovery [S2]; defer rather than add a token service speculatively.
- [One Container remains warm] → no schedules, one bounded sweep/release, existing 10-minute sleep and global quotas. CI request volume and authentication costs still need a release-frequency budget.

### Cost assessment

Current: one sleeping `lite` Container, paid Workers base, existing DOs, 5,000 normal/500 expensive daily ceilings, 60/10 minute limits, 100ms Worker CPU, 8 subrequests, 90s runtime deadline, Auth0 user traffic and repository CI. Existing release performs one image build and two Worker uploads.

Proposed: same infrastructure and image count; at most one manually requested CI run, one service token issuance, at most 20 service calls, bounded status/journal reads/writes and <=32 snapshots per attempt. No schedule, retry loop, matrix or extra environment. Monthly variable increment is approximately `R × (runner_minutes × rate + token_issuance_rate + bounded Worker/DO calls + Container awake_seconds × rate + journal/artifact storage)` where R is approved release attempts; record actual run duration and provider usage after first rehearsal. Public standard GitHub runners may have no minute charge, but verify selected runner and artifact allowances; do not assume this covers larger runners/storage. Auth0 M2M allowance is tenant-plan dependent and unresolved. Container wake plus 10-minute idle tail matters even for fast tests.

Worst credible failure: repeated trusted dispatches/compromised deployment token keep the Container warm, issue tokens, accumulate builds/logs and alter other Workers permitted by account scope. One-instance ceiling is not a money cap. Mitigate no automatic retries/triggers, least privilege, job/run bounds, existing global breaker, owner kill switch, short evidence retention and an agreed release-attempt ceiling. Proposed initial ceiling: four supervised attempts in one day; stop/review costs before repeated failures. Lower-cost fallback: existing local command + edge/live-owner checks; or service profile only in offline CI with production promotion still owner-run. No provider activation or plan upgrade until owner selects the cost/identity setup.

## Migration Plan

1. Sol refreshes baseline, resolves packet-specific unknowns and reviews this epic. Start S1 acceptance/evidence and S2 recovery packets with local fake runners only; keep deployment credential requirement and live gate intact.
2. Integrate each bounded story, run focused tests, then required full gate on the composed SHA. Add workflow inert behind setup readiness and environment protection; no provider setup occurs during repository implementation.
3. Resolve D1–D4 and complete approved owner setup; enable synthetic runtime config only after isolation tests and secretless workflow rehearsal pass.
4. On exact current main with exact trusted CI, owner approves one release. Gather disabled/no-wake, image, enabled, service and required live-user evidence; observe real ChatGPT separately where required. Test recovery through controlled fake failure paths first; any live rollback rehearsal needs explicit release window approval.
5. Keep old change live tasks open until their own required results exist. Sol reconciles non-overlapping deltas, syncs/archives in predecessor-then-epic order, runs strict validation and full gates, commits/pushes and verifies exact remote main/CI.

## Readiness decisions and unknown register

These are gates, not unresolved tasks delegated to implementers. Sol owns their resolution and updates proposal/design/spec/tasks together when a decision changes scope.

| ID | Question / missing evidence | Default and blocking scope | Owner / resolution |
| --- | --- | --- | --- |
| D1 | Owner acceptance of the explicit release-class matrix and production synthetic boundary | Routine no-owner-token policy selected; initial cutover/live obligations retained; activation blocked until setup decision | Sol presents exact evidence matrix and fixture attack surface; record choice, never infer lowered predecessor acceptance |
| D2 | Auth0 plan permits one scoped M2M client and token volume without new cost; accept production synthetic boundary and token lifetime? | Disabled and unprovisioned; blocks S3/S6 activation. The proposed 30-minute shared-audience token lifetime is not client-only and cannot be applied without resolving user-token impact. | Sol read-only tenant/settings/plan inventory when accessible, then concrete owner setup approval; retain existing API settings meanwhile |
| D3 | Production environment reviewer/self-review/bypass policy; can job token inspect protections and write only required API types? | Explicit dispatch, exact main rule, reviewer owner, allow owner self-review, no bypass proposed; setup absent | Sol inspect available GitHub features and role; owner chooses meaningful review policy |
| D4 | Exact Cloudflare account/zone token permissions for Worker+Containers+registry/version reads, expiry, scope breadth and pricing | No token created; no claim native OIDC supported; blocks provider activation | Sol inspect pinned Wrangler requests/help and current official permissions, verify read-only access first; owner accepts account-scope residual risk |
| U1 | Pinned Wrangler upload/no-rollout/rollback schema and actual Container restore semantics | Blocks S2 provider adapter completion and live rollout; fake traces alone insufficient for live claims | Sol inspect installed package + primary docs; Luna focused parser fixtures; first approved live evidence |
| U2 | Runtime synthetic selection reaches every credential path without a bypass | Blocks S3 handoff | Sol trace references/importers; write exact contract and negative tests before Terra changes runtime |
| U3 | Latest main/active changes now differ; outstanding predecessor live checks | Blocks integration/archive only as affected | Sol refresh changes/worktrees and compare deltas before each slice |
| U4 | Durable ref API update/cleanup semantics and child cancellation on Linux/Mac | Blocks S2 handoff until deterministic protocol test plan fixed | Sol validate no conditional delete assumption, retain lease on ambiguity and confirm old-runner-stop recovery |
| U5 | What proves real ChatGPT completion in this session? | Never rely on assumed background turn; blocks real-client evidence only | Sol observe existing app and actual tool completion with timestamps/revision; owner interaction if needed |

For each packet Sol supplies a concrete full SHA, invariant, allowed files, references/callers, failing check, exact verification command, dependencies, and stop conditions. Luna may investigate facts in a disjoint scope, but Sol synthesizes decisions before asking Terra to implement. Do not mark a gate passed because the artifact exists. If a safe packet remains available, continue it while later owner setup is pending.

## Primary sources consulted

Consulted during planning on 2026-09-08; refresh plan-sensitive capabilities before setup. These support the narrow claims above, not current tenant entitlement.

- S1: [Auth0 Client Credentials Flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow) and [application client grants](https://auth0.com/docs/get-started/applications/application-access-to-apis-client-grants): machine/client access differs from user-delegated access.
- S2: [Auth0 Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation): successor issuance and family reuse invalidation.
- S3: [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/): noninteractive API token/account ID and scoped account/zone access.
- S4: [GitHub managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments): protections, secret gating and implicit unprotected environment creation.
- S5: [GitHub deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments): exact branch rules, public repository reviewer support and self-review behavior.
- S6: [Auth0 Private Key JWT](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authenticate-with-private-key-jwt): registered client key authentication, not proof of GitHub workload federation.
- S7: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [Containers commands](https://developers.cloudflare.com/containers/reference/wrangler-commands/): effective configuration/image command behavior must be checked against pinned CLI.
- S8: [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use) and [concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency): immutable action references, trusted execution boundaries and queue/cancellation limitations.
