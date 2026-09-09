# Planning evidence

## Deployment root-cause evidence, 2026-09-09

Authenticated read-only production inspection found Worker version
`173dbee6-e1ba-4236-bddd-23ea8828d373`. The Container list endpoint remained at
application version 33 and its prior digest while authoritative Container info
and the single running instance both reported version 34; info reported digest
`sha256:ae0cf57c099223dcb96c1ea27ee99626af5ac52d89b4224d4a6ae6fa6a15cbbe`.
This explains the repeated convergence failures. The shared deployment reader
now uses list once for application discovery and info for all image/version
decisions. Routine terminal runs finalize their recovery lease only after the
bounded artifact succeeds; cutover and any uncertain state retain ownership.

Baseline: refreshed `origin/main` at `775b1fffaee74f3792661d45046f84b3cd60bea0`, clean isolated worktree `plan-ci-nemlig-acceptance`, branch `codex/plan-ci-nemlig-acceptance`. Only this change's planning artifacts are modified. No runtime, provider, secret, deployment, Auth0 account or shopping-data change was performed.

Verified during planning:

- `openspec validate p1-ci-nemlig-deployment-acceptance --strict --no-interactive`: PASS.
- `openspec validate --all --strict --no-interactive`: PASS, 15 items.
- `pnpm privacy:check`: PASS, 3 tests and public-tree inspection.
- `git diff --check`: PASS.
- Root/application AGENTS, Nemlig basket/production skills, OpenSpec propose and Ponytail instructions read; operations/readiness docs and predecessor planning state checked.

`pnpm verify` and live provider/ChatGPT acceptance are intentionally not claimed for this documentation-only planning change. Every implementation/live task remains unchecked. The parent integrates this planning commit; this branch does not push main.

jCodeMunch was used first. Initial resolution matched a broad parent index, so the new worktree was explicitly indexed with AI summaries disabled and resolution retried. File outlines, exact source bundles and text searches identified deployment orchestration, authentication, principal/credential selection and acceptance helpers. JSON/YAML lack symbol extractors, so exact config/workflow reads used filesystem tools; docs/OpenSpec also used filesystem reads. One measured source bundle returned three complete symbols in 2,585 tokens against a 6,500-token cap. No token-savings estimate is claimed.

First implementation packet: S1 acceptance reporting/deadline/redaction, four verified existing files, focused acceptance tests, no provider choice or credentials needed. Second independent ready slice: S2.1 trusted CI provenance and S2.2 rollback-on-drift regression, existing deploy script/test only. Sol resolves U4 before remote-journal work and U1 before Container recovery changes. S3 identity runtime and S6 provider activation are gated by the explicit decisions in the design.

Recommendation: machine identity for routine service acceptance; actual user/ChatGPT/provider evidence remains separately required for initial cutover and affected auth/client/provider changes. The parent has asked the owner the D1 release-evidence question; no answer is assumed here.

Initial planning CI rejected an absolute laptop path in this evidence file. The path is now relative. The earlier local privacy pass did not establish that the newly added evidence was public-safe; rerun privacy checks with the planning files tracked before recording delivery success.

## First implementation integration (in progress, 2026-09-09)

- Refreshed main includes `3c703ef` and the sibling's feature-request removal. The coordinator worktree was clean before fast-forward and integration; no unrelated worktree was modified. The sibling was notified before integration.
- Terra delivered `a79c2eb`, `6fa4fbe`, and typecheck correction `f6c2c01`; Luna independently verified exact correction HEAD `f6c2c01fc287f4287a3af2c385a2522be9aff8ee`: 35 focused tests, typecheck and diff check pass. These are local packet results, not composed-revision or production proof.
- S2.1 and S2.2 add exact repository/workflow/push/main/SHA/latest-run checks, a second source check before provider access, and refusal to roll back third-party enabled or disabled drift. Remote durable journal and image/configuration proof remain incomplete.
- Root review requested further S1 corrections: default owner admin failures must not be silently downgraded to unavailable, and cleanup rejection/deadline handling needs explicit coverage. Terra corrected these in `7a15474`, independently reviewed by Luna; 37 focused tests and typecheck pass. Root also guarded the abort callback against a synchronous close throw. S1 checkboxes will be reconciled after sibling compatibility integration.
- The user retained root coordination and accepted D1's recommended release-evidence matrix. D2–D4/provider setup remain unapproved; default-off identity runtime is not yet assigned. Sol is resolving the independent U4 recovery protocol while the first slice is verified.
- No production deployment, secret handling, Auth0/Cloudflare configuration, or shopping-data mutation occurred.
- The first composed baseline passed `pnpm verify` (215 tests plus 3 smoke checks). This predates the final S1 correction and is not final integration evidence.
- Read-only GitHub setup inspection: no environments, no branch protection on main, no rulesets; Actions enabled with all actions permitted. These are setup findings, not permission to change protections.
- A sibling's newly authorized removal of all saved shopping requires a separate removal-only acceptance compatibility commit before its main push. Root holds CI integration until that change lands and will then recalculate the patch version and rerun full gates. No saved-storage fixture path will be introduced by this CI epic.
- Removal-only compatibility `afaa22a0cd5b06831b8be215c9b220cdd433f7d4` was independently scoped to three acceptance files, reviewed and delivered to the sibling: 20 focused tests, typecheck and lint pass. It does not contain CI hardening; the sibling combines it with the removed runtime.
- S1's final root correction `4c4ef75` retains only allowlisted observed revision evidence separately from the requested source SHA and rejects non-canonical CI targets before I/O. Both were reproduced with failing tests first; the corrected composed focused suite passes 38/38 and typecheck passes. Luna reviewed the diff without blockers. S1 is locally implemented; exact-main integration and full final gates remain pending under S7.
- U4 implementation is assigned to Terra in a dedicated recovery worktree using `recovery-packet.md`; only the deploy script/test are owned there. U1 local Wrangler inspection confirms no-rollout skips Container updates, but Worker rollback alone cannot establish image restoration; runtime image/configuration proof remains incomplete.

## Read-only production metadata, 2026-09-09

Existing authenticated Wrangler metadata reads confirmed Worker version
`1e088bde-55ff-429a-a6dc-09d7e88360d3` at 100%, application revision
`7566d1eec1b435b86ef86afc50c45c14ffd8c9cd`, enabled MCP and disabled credential
onboarding. CPU/subrequest limits remain 100/8 and normal/expensive daily limits
5000/500. The sole Container application reports image digest
`sha256:55d97849ed60e69f9b5461ae88c95c76eedb2ff38843e27fe195fc2b1a033545`
and one instance slot. This is current metadata, not an authenticated feature
test. A subsequent read-only instance query returned one `running` row; no
disabled/no-wake acceptance is claimed from this enabled-state observation.

Version/container JSON shapes match the pinned CLI inspection. Only allowlisted
plain safety values, version/digest metadata and binding names/types were
selected for output; secret values were not exported. The schema-v1 owner
secret bindings remain present; onboarding/encryption bindings are not yet
configured. No migration, configuration edit, wake request or deployment was
performed. These reads do not prove rollback restores a Container image.

U1 follow-up before release: Cloudflare's
[rollout documentation](https://developers.cloudflare.com/containers/configuration/rollouts/)
states Worker activation precedes image rollout and deploy success starts, not
finishes, replacement. Candidate image metadata alone therefore cannot prove
the running process uses that image. The adapter must reconcile application
version with instance version after bounded acceptance, alongside the disabled
and inactive pre-enable checks; a mismatch must not be reported as exact-image
acceptance. This remains S2.6 work, not evidence collected in the current slice.

## Acceptance slice release candidate

Merged the sibling's exact CI-green main
`50e1a9f10dedec20fea5be12f65740d3983fd1ff` while retaining saved-shopping
removal. Release policy selects `4.0.1-alpha.17` for the acceptance helper
changes; no dependency or infrastructure change is introduced.

Composed `pnpm nemlig:production:ready` passed: strict OpenSpec 17/17,
privacy checks, root `pnpm verify` with 209 tests and 3 smoke checks, packed
package smoke and credential-free Wrangler/Docker dry run. Focused acceptance
and deployment tests pass 38/38; typecheck and diff check pass. Coverage of
loaded production files is 94.17% lines, 83.04% branches and 92.19% functions;
this does not claim coverage of unloaded files. The dry run exited without a
deployment. Exact pushed SHA/CI evidence is recorded after remote verification.

Durable-recovery draft commits remain in the separate worktree and are not
included in this release candidate. Required-job inspection, finalized journal
recovery, fixture identity and protected CI activation remain incomplete.

## Acceptance slice delivered

Main and the integration branch were pushed and verified at
`94c5a7d428f1035ec1a4650c9df21e41309c4d56` (`4.0.1-alpha.17`).
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34288608870)
passed, including the required `verify` job. The sibling removal lane was
notified of the exact revision and successful CI. This closes delivery of S1,
not S2 or the full epic. Production remains at the separately recorded older
application revision; no release was dispatched.

## Required-job source gate

The coordinator isolated S2.1's remaining guard from the unfinished recovery
draft. A new regression reproduced acceptance of a green workflow with no
required job; the correction requires exactly one completed successful
`verify` job in the trusted run. Empty, other-only, skipped, failed, running
and duplicate job sets stop before Wrangler. Focused deployment tests pass
12/12 and `tsc --noEmit` passes. Including the package version edit makes the
current classifier select a patch; this slice uses `4.0.2-alpha.18`. No npm
publication is performed. Remote delivery/full gates are
verified separately; no durable-recovery draft is included in this slice.

## Durable recovery integration candidate

The coordinator combined Terra's recovery implementation through `b555308`
with current main `f04bcaf`, then incorporated its test corrections through
`5395a4`. The required successful `verify` job guard and sibling runtime removals
are preserved. Root completed the remaining remote-reader and multi-host tests.

The composed focused suite passes 37/37, with actual TypeScript checking, lint
and diff checks passing. Tests cover malformed/oversized remote blobs and extra
tree entries; failures at every intent-object API stage after lease acquisition;
pending intent inspected on another host without the original local mirror;
competing direct children rejected without overwriting; changed ownership before
finalization; missing artifact attestation; complete terminal evidence; remote
and local result-write failures; cancellation/process-group termination; and a
late successful upload response after the operation deadline, with no retry or
lease deletion.
The fake store enforces direct-parent updates and shares objects and identifiers
across hosts. These are credential-free command tests, not live provider proof.

The runbook now uses read-only inspection and explicit evidence-gated
finalization instead of manual ref/file deletion. GitHub's final read/delete
pair is not CAS; out-of-protocol races remain a documented boundary. A pending
enable intent whose verification fails remains unknown: it is not silently
converted into a verified result to permit rollback.

The committed feature is classified as minor, so the corrected release
candidate is `4.1.0-alpha.19`; no publication is intended. Full
composed readiness, exact remote delivery and CI are recorded separately below
when verified. S2.6 effective configuration/application/instance proof and S2.8
combined review remain open. Auth0 identity, protected workflow setup and live
cutover remain unactivated; no production or basket mutation occurred.

Local composed `pnpm verify` passed on the final 37-test recovery suite. The
readiness command passed its source/package stages but its credential-free Docker
build failed with `ERR_PNPM_ENOSPC` while copying dependencies into `/app`.
This is not a passing local dry run. No shared Docker cache, image or volume was
deleted. The existing CI runner runs the same full readiness command and must
pass on the exact integrated revision before this slice is reported delivered.
The committed minor-version gate passes from `4.0.2-alpha.18` to
`4.1.0-alpha.19`.

Durable recovery is delivered on verified remote main
`3e3ad58f4a4e88a09820efa6da3f0efa58a50803`.
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34293519052)
passed the full readiness command, including its Docker dry run and artifact
step. Local Colima's 20 GB data volume was verified full; host disk and VM root
were not full. No shared cache, image, volume or provider resource was removed.
S2.3–S2.5 are checked; the epic is 12/44. S2.6 continues in the isolated
`codex/ci-image-config-proof` worktree, with real command-shape corrections
recorded in its packet. Production remains unchanged.

## Strict Container parser slice

Documentation main `4434c0258d00fb1159f9dffb47dd35986de64d3c` passed
[exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34294175685).
Terra's parser draft was corrected and completed by the coordinator in isolated
commit `c7644369e4c926801248415574f5b78611e3419f`. The new regression failed
against the old parser because an invalid application ID was accepted, then
passed with strict UUID/digest/positive-integer application-version validation.
Inactive acceptance requires the one fixed Durable Object assignment and its
null instance version. Worker UUID transition fixtures remain unchanged.

Focused deploy tests pass 38/38; TypeScript, lint and strict OpenSpec checks
pass. This is a parser slice, not completion of S2.6: same-application-version
enablement, running-instance convergence, effective configuration preservation
and image-aware recovery still require implementation and composed proof. The
integration candidate is `4.1.1-alpha.20`; production is unchanged. Local Docker
remains blocked by its full data volume; exact-head CI supplies the full build
gate and is recorded separately when verified.

The parser slice was integrated and remote-ref verified at
`ae1afda49c4e1c45b11eda191f137fa913fadf83` (`4.1.1-alpha.20`).
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34294591659)
passed the full readiness command. The integration worktree was clean afterward;
no live deployment or local Docker cleanup occurred.

## Application-version drift slice

Terra commit `3bb7857cdf764f746d3208139983691b652f5b1f` adds exact numeric
Container application-version comparison during enablement and rollback.
Both regressions cover unchanged image digests with changed application versions;
neither state may be reported verified. Coordinator independently reran all
40 focused deploy tests successfully. Integration version is `4.1.2-alpha.21`.
S2.6 remains open for effective configuration and running-instance proof.
No production mutation occurred.

Application-version drift protection was integrated and remote-ref verified at
`4e164eaec3c0e864a30be3daffd30cbba0436ca3` (`4.1.2-alpha.21`). Full local
`pnpm verify` and the committed patch-version gate passed.
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34295397505)
passed the required `verify` job, including full production readiness. The
next running-instance slice remains local work, not a live acceptance result.

## Running-instance acceptance slice

Terra commit `9324b3e1d482c8424a48f75cb735abbb92dec190` adds post-acceptance
proof of the fixed running instance at the candidate application version. It
allows bounded convergence from provisioning or an older running version,
rejects newer versions and invalid/terminal states, then rereads the Worker and
application before success. The 36-read cap shares the existing operation
deadline and cancellation-aware delay; no mutation retry or extra Nemlig request
is introduced. Timeout reasons remain allowlisted in the recovery journal.

Coordinator reviewed the complete diff and independently passed all 47 focused
deploy tests. The integration candidate is `4.1.3-alpha.22`. Configuration
preservation, persisted application/configuration snapshots and instance-aware
recovery remain open; S2.6/S2.7 are not checked. Production remains unchanged.

Running-instance proof was integrated and remote-ref verified at
`8532ef31d3a485c31598bf5786ba2f8d584e344b` (`4.1.3-alpha.22`). Full local
verification and the committed version gate passed.
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34295910383)
passed full readiness on the required `verify` job. No live deployment occurred.

## Effective configuration preservation

Sol resolved the concrete configuration contract; Terra implemented draft
`e615e5b16dcc49137ce806281561085e805a731b`. The coordinator completed the
missing acceptance matrix and reviewed runtime validation in `1ec485d`.
The pinned Wrangler reader is exercised without credentials, and both actual
deploy argument lists preserve all 16 validated plain settings, including live
onboarding over the repository default. Both version readbacks compare canonical
configuration and secret-name/type metadata. No secret values enter the digest,
deploy arguments or journal, and no provider read was added.

All 56 focused tests, TypeScript and lint passed in the isolated implementation
worktree. Coverage includes reordered bindings, explicit self targets, legacy and
lowercase secret names, malformed/duplicate/wrong-type bindings, secret changes
at both readbacks, redirected paths, and local/live safety drift. Invalid plain
values also failed against the draft runtime, then passed with validation
restored. Terra's first two regressions were run against the baseline only after
implementation; this is retrospective failure evidence, not test-first process
compliance. The coordinator recorded that deviation rather than claiming it met
the required order.

Final review added a test-first regression for credential-bearing HTTPS URLs
and non-decimal ports: the draft incorrectly accepted a URL containing userinfo;
`9c51abf` rejects it before deployment or digest creation. The regression passed
after the fix. The same 56-test matrix includes the additional invalid inputs.

Integration candidate: `4.1.4-alpha.23`. Persisted configuration/application
snapshots and full recovery proof remain open, so S2.6/S2.7 remain unchecked.
No provider setup or production mutation occurred.

Configuration preservation was integrated and remote-ref verified at
`2ab66045aa30f94a9ebd54fe22961e2e97d63158` (`4.1.4-alpha.23`).
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34297628273)
passed the required `verify` job and full readiness. The worktree was clean
afterward. Recovery snapshots and finalization proof continue separately.

## Full recovery snapshot proof

Terra supplied snapshot draft `1e21a2d`; the coordinator completed its integration
tests and the shared recovery predicate in `7877567`. Journals now record numeric
starting/disabled/enabled application versions and the starting config digest.
The 25-to-26-to-26 fixture proves their distinct sources in both remote and local
journals before the relevant transitions. Four metadata reads verify Worker,
config, application ID/image/version and instance state without waking or polling
an instance. Inspection and finalization share this predicate; finalization
requires both evidence-saved and original-runner-stopped attestations. Failure
recovery and rollback also reverify previously recorded state.

New regressions failed before the stopped-runner, missing-snapshot and rollback
proof fixes. Independent review then found that restored cleanup also needed the
starting enabled flag. Its opposite-state test failed before `08da9fec278cc7d34453b3547d3ab99fc6422f9e`
added the closed boolean snapshot and exact comparison. The reviewer independently
reran all 65 focused tests and confirmed the blocker remediated with no remaining
blocker. Old journals remain readable but lack cleanup authority. No secret value
is recorded or hashed; new snapshot fields retain the 8 KiB/32-transition bounds.

The requested extra Luna slot was unavailable, so the existing independent review
agent was reused. Root remains coordinator under the user's explicit instruction;
Terra drafted, root completed the missing tests and recovery implementation, and
the independent reviewer verified the final immutable revision. This role
fallback changes no verification requirement or external authority.

S2.6–S2.8 are locally complete. Integration candidate is `4.1.5-alpha.24`;
remote-ref/CI confirmation follows separately. Actual image rollback behavior and
first live acceptance remain U1/S7 evidence, not claims made by these tests.
No provider setup, credential access, Container build cleanup or production
mutation occurred.

## S2 exact-head delivery and S5 readiness checkpoint

Full recovery was integrated and remote-main verified at
`1b5df9ebe09820a0ba934e803b0d46799df7675c` (`4.1.5-alpha.24`).
[Exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34299114456)
completed successfully with the required `verify` job, including production
readiness. A subsequent fetch confirmed clean coordinator HEAD and origin/main
both matched that revision. The sibling was notified. Production was not changed.

The coordinator prepared `workflow-trust-packet.md` from the actual existing
source/provenance tests and CI workflow. This is preparation, not S5 completion:
the production workflow depends on S4, and the Auth0 identity/lifetime decision
still blocks S3/S4. Existing no-provider-call tests do not prove job-level secret
withholding. No placeholder workflow or duplicate trust framework was added.
Both a new Sol planning slot and reactivation of the existing independent
reviewer were unavailable at the thread limit; root performed this small
readiness review locally. Progress remains 15/44, with no provider authority
inferred and no task marked complete from a plan alone.

## U2 credential-path trace before identity approval

Read-only source evidence at `9dac7a2e0c83a167ad1d2ee622679a554e447f49`, whose
[exact-head CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34299697286)
passed. jCodeMunch verified source hashes for the functions below. No runtime
change or identity approval is implied by this trace.

- `auth0.ts:createAuth0Verifier` checks signed issuer/audience/RS256 and the
  ordinary required scope, returns client ID and subject, and exposes expiry.
  `cloudflare-worker.ts:authenticateSubject` discards everything except subject.
  Service selection must preserve verified client/scope/expiry evidence, require
  its exact configured binding, and never select from unverified headers. Cache
  identity must account for any new verification configuration.
- Worker `fetch.authenticate` resolves static principals, then schema-v2 stored
  principals. Recognized service identity must branch before either human-data
  resolution path; invalid/disabled service claims must not fall through to a
  human identity or stored-principal lookup.
- `handleGatewayRequest` orders kill switch, configuration, bounded request
  classification, authentication, admin restriction, admission and forwarding.
  Existing classification is a cost category, not a service authorization
  allowlist. Deny service-forbidden protocol/tool/resource requests before
  admission/forwarding while preserving existing deadlines and admission.
- Worker `fetch.admit` currently sets credential-required for every schema-v2
  request. `principal-records.ts:admitPrincipalRequest` already conditionally
  reads the credential record while retaining transactional usage accounting.
  Reuse that seam only after trusted service selection; never relax credential
  requirements for ordinary users. Usage storage is required operational state,
  distinct from forbidden human principal/credential/shopping storage. Negative
  spies must distinguish these keys rather than ban all storage indiscriminately.
- `attachAdmissionCredential` strips four client-supplied internal credential
  headers. Preserve that stripping; no new caller-controlled fixture marker may
  grant authority. The backend must independently verify the original JWT.
- `http.ts:createHttpApp` currently enforces ordinary scope middleware, then
  static credentials or schema-v2 envelope decryption, then session ownership,
  context creation and MCP transport. Service selection must precede human
  credential resolution without bypassing real authentication or transport.
  Keep session principal/policy/generation ownership checks. The shared contexts
  map enforces `MAX_PRINCIPALS`; use one separately bounded service context so it
  neither consumes nor evicts an invited-human slot.
- `defaultPrincipalContext` constructs a real `NemligClient` and proposal
  service. Service context must not invoke it. MCP basket/favorites handlers use
  `ensureLoggedIn`; the immutable client must satisfy its authenticated fixture
  contract without ever reading credentials. MCP registration/direct dispatch
  must independently exclude all mutations and automated shopping, not merely
  hide them in the advertised inventory. Preserve the removed saved-shopping
  and feature-request surfaces as removed.

Implementation tests must cover wrong/missing client, scope and expiry; forged
headers; disabled identity; both human-policy schemas; cross-principal/session
reuse; full human capacity; forbidden direct tools/resources; and credential,
decrypt, real-client, provider-egress and human-storage spies. Existing signed-JWT,
HTTP and gateway tests are the seams to reuse, not a second server/test framework.
This identifies the concrete pre-credential and capacity boundaries; U2 handoff
still requires the accepted identity contract and final closed protocol/tool
allowlist. S3/S4 remain gated, and no S3 checkbox is complete.

Read-only setup refresh found zero GitHub environments and the existing Auth0
tab still at login. Token lifetime/allowance and the owner identity decision
therefore remain unresolved. The browser CLI was unavailable; only existing-tab
inventory was inspected through the available browser connection.
