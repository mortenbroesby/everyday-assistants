## 0. Sol coordination and story readiness

Epic: trusted CI release without routine owner-token handling, with durable recovery and honest acceptance. At the user's request, this root thread now coordinates integration/provider decisions; references to Sol coordination below describe that role, not a second persistent coordinator. Sol resolves bounded planning unknowns, Terra implements substantial packets, and Luna independently verifies. A blocked later story does not block independent ready repository work.

- [x] 0.1 Sol refreshes origin/main and records full SHA, clean worktree, active sibling ownership and predecessor task counts; verify with Git/OpenSpec state and preserve unrelated worktrees.
- [x] 0.2 Sol reads proposal/design/spec and resolves each ready packet's references/importers, invariant, cost effect and exact file/test scope before delegation; verify a short packet handoff is recorded with no delegated unresolved architecture decision.
- [ ] 0.3 Sol records D1–D4 decisions separately from technical U1–U5 evidence, updating all affected artifacts together; verify undecided provider/fixture activation remains disabled and no routine repository reapproval is requested.

## 1. S1 — Acceptance reports and bounded read-only execution

Readiness: READY after 0.1–0.2. No provider identity choice needed. Terra owns `apps/nemlig-assistant/scripts/production-acceptance.ts`, `src/production-acceptance.ts`, `src/production-acceptance.test.ts`, and `src/production-acceptance-entry.test.ts` (all verified present). Existing default owner behavior and token requirement remain intact. Luna reviews/test-runs without overlapping edits. No service runtime path yet. Focused command from repository root: `pnpm --filter nemlig-assistant exec tsx --test src/production-acceptance.test.ts src/production-acceptance-entry.test.ts`.

- [x] 1.1 Characterize current owner sweep and unavailable fixtures, then add failing checks for separated owner-admin result and allowlisted report fields; verify existing tool calls/counts and missing-fixture results stay explicit.
- [x] 1.2 Implement explicit evidence labels and fixed-category redaction at CLI exit, preserving default live-user behavior; verify hostile assertion/provider payloads and tokens never appear in output or saved evidence.
- [x] 1.3 Enforce one 90-second operation deadline including connect/edge/features/admin/close and abort underlying work; verify hanging connect, call, cleanup and late-response tests terminate without further calls.
- [x] 1.4 Reject mutation mode/approval variables in CI acceptance and keep closed production target/tool lists; verify no fake trace invokes prepare, apply, list writes, issue creation or basket mutation.
- [x] 1.5 Luna runs focused acceptance/entry tests through installed `tsx --test`, and Sol reviews default-behavior diff; verify pass evidence and scoped commit before widening scope.

## 2. S2 — Trusted source and recoverable shared deployment command

Readiness: source-trust and drift tests READY after 0.1–0.2; remote-journal implementation requires Sol to settle U4 protocol locally; image/rollback adapter requires U1 installed-CLI evidence. Terra owns `scripts/production-deploy.ts` and `src/production-deploy.test.ts`. This is sequential with any other deploy-script packet. Luna independently inventories pinned Wrangler commands/JSON behavior and supplies redacted synthetic parser fixtures, not provider mutations. Focused command: `pnpm --filter nemlig-assistant exec tsx --test src/production-deploy.test.ts`.

- [x] 2.1 Add failing fake-runner cases for PR success at same SHA, wrong workflow ID/path/repo/ref, stale main after approval, malformed SHA and unsafe dispatch content; implement trusted CI provenance and verify all reject before mutation. The required `verify` job must be exactly one completed successful job; missing, skipped, failed, running or duplicate jobs stop before provider access.
- [x] 2.2 Add a regression for unexpected enabled provider drift during failure recovery; restrict rollback to our known candidate/current ownership and verify no command overwrites the other actor's deployment.
- [x] 2.3 Replace source-SHA lease ownership with unique operation/run identity and a bounded remote journal on the shared ref; verify two hosts/same SHA, legacy lease, non-fast-forward update and changed owner cannot acquire, overwrite or clean each other's leases.
- [x] 2.4 Persist bounded redacted intent before and result after every transition, plus local mirror; verify remote persistence failure prevents mutation and a simulated lost local filesystem can reconstruct starting state and pending intent from remote evidence alone.
- [x] 2.5 Handle cancellation/child termination/late provider success as uncertain and retain lease; verify kill-before-result, timeout-after-upload, journal-write failure and failed final artifact scenarios never repeat a mutation or falsely release ownership.
- [x] 2.6 Record application/image digests and effective allowlisted config/secret binding names; verify single-build enablement, `keep_vars`/onboarding preservation, safety drift, unknown CLI schema and Worker-only rollback mismatch all fail or recover truthfully.
- [x] 2.7 Add bounded recovery inspection using the same journal and command seams, with no force-unlock or automatic stale takeover; verify a second host must establish original runner termination, current candidate state and exact lease identity before cleanup.
- [x] 2.8 An independent review agent (Luna when available) runs focused deploy tests and reviews command traces; the current-thread coordinator, as requested by the user, integrates S2 after source, ownership, durable evidence and configuration checks pass, recording scoped SHA and remaining live-only U1 proof. The unavailable Luna slot and existing-agent review are recorded in evidence.
- [x] 2.9 Replace stale `containers list` image/version reads with `containers info <validated-id> --json`; verify list is used only for single-application discovery and delayed list metadata cannot reject an otherwise matching info/instance state during deployment or recovery.

## 3. S3 — Isolated machine acceptance identity

Readiness: default-off repository implementation authorized by the 2026-09-09 owner clarification after U2 tracing and closed fixture contract review. D2 provider setup remains blocked until concrete entitlement/access review. Default-off code has no provider effect; activation is S6. Terra's exclusive scope: `src/auth0.ts`, `src/cloudflare-config.ts`, `src/cloudflare-gateway.ts`, `src/cloudflare-worker.ts`, `src/http.ts`, `src/mcp.ts`, `src/principal-policy.ts` only if needed, existing associated tests, and at most one small fixture module. Sol must minimize this provisional file set after reference tracing. No second server/framework/dependency. No concurrent credential-onboarding runtime edits.

- [x] 3.1 Add failing end-to-end local checks with real signed test JWTs for default-disabled service identity, wrong claims/client/scope, forged headers and ordinary-user fixture selection; verify no unauthorized admission/wake/credential read.
- [x] 3.2 Add explicit statically bounded non-owner service identity selection through real Worker and backend validation; verify owner schema-v1 and invited schema-v2 behavior remains green and no owner alias or onboarding migration is introduced.
- [x] 3.3 Reuse the existing context/client seams for immutable synthetic basket/catalogue/favorites with no real credentials or provider client; preserve the separately approved saved-shopping removal and verify an egress/credential spy fails if any service operation attempts Nemlig HTTP, envelope decrypt, real storage or owner context access.
- [x] 3.4 Enforce the service allowlist at both edge and backend, including advertised inventory and direct-call denial; verify every mutating/admin/credential/automatic-shopping/issue operation and unknown tool is denied.
- [x] 3.5 Preserve guest admission ceilings, family reserve, global breaker, one Container, deadlines and per-sweep request cap; verify exhausted/disabled/unknown service identity cannot bypass limits or cause extra wake.
- [x] 3.6 Luna executes real local HTTP/MCP fixture flow against built code plus negative cross-principal/session/resource cases; Sol reviews the trust boundary and confirms no production auth bypass or synthetic-only shortcut before integrating.

## 4. S4 — Machine token issuance and release policy

Readiness: after S1/S3, D1/D2 selection and local cryptographic test contract; provider secrets still absent. Terra owns a minimal token helper only if existing auth utilities cannot cover it, acceptance scripts/helpers and tests. `production-deploy.ts` edits begin only after S2 integration. Luna owns focused external docs/config verification, not secret handling.

- [x] 4.1 Add one bounded M2M token request with exact issuer/audience/service scope and in-memory response validation; verify signature/expiry/client/scope checks, invalid/expired credentials and token errors expose no values and trigger no automatic retries.
- [x] 4.2 Add the closed service-fixture acceptance profile, reuse bounded report/deadline helpers, and keep owner-admin/live-user evidence separate; verify expected synthetic inventory and forbidden-operation tests run through the real local MCP transport.
- [x] 4.3 Implement reviewed release-class evidence gating: initial cutover and affected auth/provider/client changes require additional live evidence, routine releases after cutover need no owner token; verify unknown diff scope/cutover status fails closed and cannot be overridden by arbitrary dispatch input.
- [x] 4.4 Integrate class-specific valid authentication preflight with deploy without weakening existing explicit local owner mode; verify missing/short-lived/invalid required credentials stop before first provider mutation and routine service mode never reads owner-token state.
- [x] 4.5 Luna verifies one-token/request budget and no refresh-token persistence path; Sol reviews complete credential flow, redacted report and scoped checks before integration.

## 5. S5 — Protected GitHub Actions entry point

Readiness: after S2/S4 for executable integration; workflow trust tests can be prepared after S2 source contract. Environment setup remains separate. Terra owns `.github/workflows/nemlig-production.yml` (new) and minimal workflow contract test; Sol owns package/version coordination. Existing PR CI credentials/permissions remain unchanged.

- [x] 5.1 Add failing workflow/input checks for non-main dispatch, missing environment readiness, untrusted CI provenance, unsafe input interpolation and forbidden event triggers; verify no job reaches deployment credentials in those cases.
- [x] 5.2 Add fixed manual dispatch, exact-SHA preflight, protected environment, immutable action pins, frozen install, isolated credential-free build and one production concurrency group with cancellation disabled; verify branch/ref gating, no privileged PR artifact/cache reuse and no persistence of checkout credentials.
- [x] 5.3 Scope GITHUB_TOKEN permissions to actual trust/journal calls and secrets to their exact command steps, with total timeout and bounded final evidence artifact; verify missing protections/credentials fail closed and artifact failure cannot erase the remote journal.
- [ ] 5.4 Run a credential-free Linux workflow rehearsal using fake provider/token endpoints and the real command orchestration; verify successful trace, canceled run, same-SHA competing run, source drift and rollback failure all report the correct terminal state.
- [x] 5.5 Luna checks workflow syntax/action pins/permissions and Sol inspects exact workflow bytes against release trust policy; verify no provider changes occurred and production readiness stays false until S6.
- [x] 5.6 After the deployment process and bounded artifact upload complete, automatically invoke the existing exact-state finalizer for known terminal non-cutover runs; verify pending live acceptance, unknown state, failed artifact upload, changed lease head, or provider drift retains ownership, with no TTL or force cleanup.

## 6. S6 — Owner-approved provider setup and cutover readiness

Readiness: BLOCKED on D1–D4 and completed repository isolation/trust/recovery gates. Sol presents `owner-setup.md` with actual IDs/permissions/plan findings but no secret values. Owner authorizes provider/access/cost choices; only explicitly authorized setup runs. Terra/Luna receive no production secrets.

- [ ] 6.1 Sol completes read-only Auth0/Cloudflare/GitHub entitlement and resource inventory, then presents exact identity, fixture boundary, token permission/expiry, reviewer policy and bounded cost proposal; verify owner decisions are recorded before mutations.
- [ ] 6.2 Perform only approved GitHub environment, Auth0 M2M grant and Cloudflare CI-token setup using secure provider/UI secret entry; verify names/scopes/protection metadata and token validity without exposing values.
- [ ] 6.3 Verify the service identity has no normal-user, Management API, owner, real provider or admin grant and required production switches/config preserve existing state; record only pass/fail and safe version/config names.
- [ ] 6.4 Verify exact current main CI, deployment policy, remote journal recovery instructions and selected cutover/live acceptance path are ready; verify missing live cutover credentials/evidence plan blocks deployment and no predecessor task is prematurely checked.

## 7. S7 — Full integration, approved release and evidence

Readiness: repository verification can finish before S6; provider release requires S6 and explicit exact-release authority. Sol coordinates versions, main integration, provider commands and status. Luna verifies readbacks; Terra fixes only bounded assigned defects.

- [x] 7.1 Run scoped tests, public privacy, `pnpm verify`, `pnpm nemlig:production:ready` and `openspec validate --all --strict --no-interactive` on the composed revision; verify all required checks pass and record unrelated baseline failures separately.
- [x] 7.2 Commit/push scoped integration to main using the established worktree process and verify refreshed remote SHA plus trusted exact-head CI; verify running tests on an older SHA does not count as final evidence. Current proof: `8654a4ba67643abecbbe35516fc9bd15279044a4`, CI run `34363170924`.
- [ ] 7.3 After owner approves that release, dispatch once and verify remote intent journal, both disabled routes/inactive instance, one candidate image, same-image enablement and class-required acceptance; verify bounded sanitized report matches actual Worker/image/SHA and no data mutation occurred.
- [ ] 7.4 Complete approved bounded live-user/provider and existing-app ChatGPT cutover evidence, recording actual timestamps/revision and pending/unavailable boundaries; verify no duplicate app, background-handoff assumption, prepare/apply or shopping-data write.
- [ ] 7.5 Record measured CI duration, token calls, request counts and Container state against the initial cost budget, and verify recovery evidence; if a live rollback rehearsal is separately approved, execute and verify exact Worker/image restoration or honest disabled/unknown state.
- [ ] 7.6 Sol updates operations/readiness docs and predecessor evidence only where actual acceptance satisfies their tasks; verify source/SHA/profile separation and no historical result is rewritten as current.

## 8. S8 — Closure and archive

Readiness: all applicable live and repository gates complete, no retained unknown production state. Sol owns specification/archive/docs changes and release version accounting.

- [ ] 8.1 Reconcile older hosting deltas and their remaining live tasks, sync/archive completed predecessors in order, then this capability; verify strict validation and no conflicting, duplicated or silently waived requirement.
- [ ] 8.2 Run required final repository gates, commit/push archival changes, verify exact remote main/CI and state last deployed application SHA separately from archival SHA; deliver durable evidence links, remaining owner operations if any, and jCodeMunch usage without invented savings.

## 2026-09-09 repository integration evidence

Default-off S3/S4 and protected S5 workflow are implemented. Focused deployment tests pass 71/71. Real local signed edge-to-HTTP acceptance exercises six Apps tools/picker and five tools without Apps; exact HTTP 403 rejection is distinguished from transport failures. Guest admission still runs for the service identity, while schema-v2 human credential lookup is excluded for that verified identity. Missing/extra scope and missing expiry reject; cache policy changes invalidate the verifier.

Native GitHub environment metadata is checked using Actions Read. Readiness is consumed only inside the protected deployment job; there is no unsupported variables-API permission or privileged GitHub token. No environments exist at the read-only check, runtime configuration remains default-off, and `acceptedRevision` remains null. S5.4 Linux orchestration rehearsal, S6 provisioning/entitlement, production deployment and live evidence remain open. Dry-run image build and packed package checks are local evidence, not production acceptance.

Independent review passed 62 focused security/acceptance tests and all 6 HTTP transport tests. Full `pnpm verify` passed 284 tests plus 3 smoke checks. Strict specifications, privacy and packed interface checks passed.

`pnpm nemlig:production:ready` passed, including the full local image dry run; no upload/deployment occurred. The journal artifact explicitly includes its hidden `.git` path; a failing structural check preceded that correction.
