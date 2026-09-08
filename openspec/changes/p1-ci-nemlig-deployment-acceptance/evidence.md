# Planning evidence

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
