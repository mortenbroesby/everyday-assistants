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
