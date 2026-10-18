# Nemlig architecture integration evidence (#326)

**Reviewed 2026-10-18.** This is the Step 6 repository integration record for [#319](https://github.com/mortenbroesby/everyday-assistants/issues/319). The original [Step 0 baseline](nemlig-architecture-refactor-baseline.md) remains a snapshot of `c514d3dbb4e4f0d4adc35b188e61a17562cd5646`; this report reviews integrated `origin/main` at `b351ca0ccde313f8c6d996d434dc1827cbdcb8ed`. It is source, package, synthetic-test and CI evidence. It does not establish the currently installed ChatGPT package or native UI behavior.

## Delivery ledger and evidence planes

| Stage | Merged output | Remaining boundary |
| --- | --- | --- |
| #320 / [PR #327](https://github.com/mortenbroesby/everyday-assistants/pull/327) | [Architecture and safety baseline](nemlig-architecture-refactor-baseline.md), source snapshot and caller map | Historical snapshot, not live acceptance |
| #321 / [PR #328](https://github.com/mortenbroesby/everyday-assistants/pull/328) | Current seven model tools, three app-only actions, aligned plugin source and package `0.1.7` at the main baseline | Installed package version and refreshed ChatGPT catalog unverified |
| #322 / [PR #329](https://github.com/mortenbroesby/everyday-assistants/pull/329) | [Retirement record](nemlig-backend-retirement.md): native-list editing/transfer, fixed-mode paths and proposal service removed | Read-only saved-list source and historical receipts retained |
| #323 / [PR #330](https://github.com/mortenbroesby/everyday-assistants/pull/330) | [Review schema/state record](nemlig-review-contract-state.md), shared wire validation and reduced mirrored host state | Cached-card display compatibility retained; native host not observed here |
| #324 / [PR #331](https://github.com/mortenbroesby/everyday-assistants/pull/331), [PR #335](https://github.com/mortenbroesby/everyday-assistants/pull/335) | [Journal record](nemlig-operation-journal-compatibility.md), current direct port, synthetic failure/capability tests and local SQLite DO restart/claim evidence | Production historical receipt population uninspected |
| #325 / [PR #332](https://github.com/mortenbroesby/everyday-assistants/pull/332) | [Pure provider parsing](nemlig-provider-normalization.md), one session client retained | Intentional `UnitPriceLabel` fallback changes a previously empty search `unit`; authenticated/future response variants unverified |
| Cross-stage / [PR #333](https://github.com/mortenbroesby/everyday-assistants/pull/333), [PR #334](https://github.com/mortenbroesby/everyday-assistants/pull/334) | Concurrent direct Submit and viewer focus/reduced-motion regression cases | Synthetic evidence, not real ChatGPT acceptance |

The app package declares `6.3.0`. Main at `b351ca0` contains private plugin `0.1.7`; this Step 6 PR prepares `0.1.8` to correct packaged guidance, without installing it. [Exact-main CI 39148108187](https://github.com/mortenbroesby/everyday-assistants/actions/runs/39148108187) passed at `b351ca0`, including full lint/build/type/tests, format, package smoke, Cloudflare dry run, Fallow regression check and review-UI smoke. [Production workflow 39148214227](https://github.com/mortenbroesby/everyday-assistants/actions/runs/39148214227) reports successful “Deploy and verify exact candidate” for that SHA. This is workflow evidence of deployment, not an independent read of the served Worker/Container revision. The installed private package version, refreshed tool catalog, rendered native card and authenticated provider behavior are **PENDING OWNER ACCEPTANCE**. A ZIP build, successful deployment or HTTP 200 cannot fill those gaps.

## Integrated ownership and call path

```text
ChatGPT model: 7 user tools ─┐
ChatGPT viewer: 3 app actions ├─> authenticated Worker (Auth0 before wake)
Local stdio / CLI ────────────┘            │
                                          Container HTTP MCP
                                               │ principal-scoped context
                            ProductReviewService (process-local draft)
                              │               │
                     review-schema.ts          NemligClient (one session,
                     React viewer state        cookies/CSRF, bounded reads)
                                               │
                                   provider catalogue/lists/basket
                                               │ explicit Submit only
                           callback capability → owner Durable Object receipt
                                               │ atomic claim before dispatch
                                               └→ one additive bulk POST → readback
```

The model and React host can display and request actions, but neither card nor caller-supplied `submission_id` proves a live draft or independently proves user consent. The server checks authenticated principal, exact draft/context/account/payload and active state; a clear conversational instruction, explicit approval or viewer Submit click supplies user authorization. The journal is the persisted dispatch fence, not a saved draft. The draft is process-local, nominally two-hour idle, and disappears after a Container restart or sleep. Nemlig owns catalogue facts, saved lists and the real basket. Read-only source-list loading copies exact rows into a fresh draft; draft edits do not edit that source. Cookies and XSRF are scoped to the authenticated client. Viewer pending quantities and dialog/navigation state are UI-local and cannot authorize a write.

The current [MCP contract](../openspec/specs/nemlig-mcp/spec.md) and `interfaces.test.ts` assert seven model tools (`check_nemlig_connection`, `find_groceries`, `get_profile`, `show_my_basket`, `start_product_review`, `update_product_review_conversation`, `submit_product_review_conversation`) plus app-only `update_product_review`, `submit_product_review`, `save_basket_as_shopping_list`. Machine service acceptance exposes only `find_groceries` and `show_my_basket`. Current `ui://nemlig/shell.html` is stable; previously published viewer URIs render inert cards, because old host conversations may cache them. The shared `review-schema.ts` validates current MCP output and a narrower cached-card display shape; the server remains authoritative when a card is stale. `NemligClient` retains login, requests, retries, basket preflight and readback; `provider-response.ts` owns deterministic normalization without creating a second HTTP client.

## Acceptance matrix at the reviewed revision

`PASS` below means named synthetic or source checks passed at `b351ca0`, not that the equivalent live host/provider flow was observed. [Exact-main CI](https://github.com/mortenbroesby/everyday-assistants/actions/runs/39148108187) is the complete same-revision build/test/smoke record. The local commands and any isolated failure are recorded below.

| Boundary | Evidence | Status and limit |
| --- | --- | --- |
| Search, details, favourites, product facts, bounded text | `client.test.ts`, `provider-response.test.ts`, `product-discovery.test.ts`, `product-presentation.test.ts`; API manifest 29 operations, 23 client-used | PASS synthetic; live authenticated catalogue not tested here |
| Read-only exact saved-list source and incomplete inventory | `client.test.ts`, `product-review.test.ts`, `interfaces.test.ts`, `smoke-review-ui.ts` | PASS synthetic; source unchanged in fixtures |
| Draft start/edit/abandon, IDs, owner, expiry, capacity, restart | `product-review.test.ts`, `interfaces.test.ts`, `product-review-submission-smoke.test.ts` | PASS synthetic; process restart loses draft by design |
| MCP tools/schema, retired inputs, stdio/CLI/HTTP, viewer resources | `interfaces.test.ts`, `http.test.ts`, `smoke-package.ts`, `retired-product-viewer.test.ts` | PASS synthetic/packed package; installed catalog unknown |
| Review serialization, stale/cancelled result ordering, quantity flush, navigation | `review-schema.ts`, `product-viewer-adapter.test.ts`, `viewer-page.test.ts`, `product-viewer-recovery.test.ts`, `smoke-review-ui.ts` | PASS synthetic; mounted native card not tested here |
| Keyboard/touch/focus, reduced motion, long list/virtualization | `viewer-page.test.ts`, PR #334, CI review-UI browser smoke | PASS synthetic; actual mobile gesture/host not tested here |
| One 37-line bulk add, positive deltas, baseline preservation, readback | `client.test.ts`, `product-review.test.ts`, `product-review-submission-smoke.test.ts`, PR #333 | PASS fake provider; no real basket write performed here |
| Known no-write vs uncertain, no automatic replay, separate whole-basket save | `product-review.test.ts`, `client.test.ts`, `product-review-submission-smoke.test.ts` | PASS fake provider; provider atomicity under external concurrency remains unproven |
| Atomic claim, restart, receipt expiry, account/payload/generation isolation | `local-basket-storage.test.ts`, `local-basket-callback.test.ts`, PR #335's isolated local SQLite DO simulation | PASS synthetic/local runtime; production stored receipts uninspected |
| Auth-before-wake, capabilities, stream revocation, request limits, privacy | `auth0.test.ts`, `principal-policy.test.ts`, `cloudflare-gateway.test.ts`, `local-basket-capability.test.ts`, `http.test.ts`, `privacy:check` | PASS synthetic; no new hosted authentication probe |
| Package source/ZIP, endpoint, icon, app binding, default prompt | `package-chatgpt-plugin.mjs`, `package-chatgpt-plugin.test.mjs`, `smoke-package.ts`; ZIP `0.1.8` inspected (SHA-256 `fe678f765c88c6ee89b80de9d480ad04fa9dd2df7460625e98375acc70465b03`) | PASS local package; installation/refresh unverified |

The canonical basket spec contained a real cross-stage conflict: it still required retired proposal IDs and sequential product writes. This PR reconciles that spec with the merged one-request direct-draft path, retains its add-only/no-replay invariants, and adjusts stale active package, BACKLOG tool-availability, and production-readiness wording. The historical proposal design remains in Git history and historical change records. #295 remains an open historical, superseded native-list direction; this integration neither implements nor closes it.

## Verification performed and remaining limits

At `b351ca0`, on Node 24.13.0 and pnpm 9.15.9, a fresh worktree used one `pnpm install --frozen-lockfile`. From the repository root, `pnpm verify` (lint only), `pnpm spec:validate` (34 items), `pnpm privacy:check`, `pnpm nemlig:check:api` (29 operations), `pnpm --dir apps/nemlig-assistant check`, `pnpm nemlig:smoke:package`, and the plugin ZIP packager passed before documentation edits. The first broad local focused test command selected 14 client/review/MCP/HTTP/Worker/storage/viewer files and returned **217 PASS / 1 FAIL**: `product-review-submission-smoke.test.ts` reported loopback `ECONNRESET` while package build and other checks ran concurrently. The same smoke rerun alone passed **1/1** without a code change; the complete main CI suite also passed at the same source SHA. This points to local concurrent-load interference but does not erase the failed first run. After the documentation/package edits, strict OpenSpec validation (34/34), package tests (4/4), `pnpm verify`, Prettier and ZIP integrity passed. Step 6 PR-head CI remains pending until the PR runs.

The selected focused command ran from the repository root at `b351ca0` (all production source inputs unchanged afterward):

```sh
pnpm --dir apps/nemlig-assistant exec tsx --test \
  src/client.test.ts src/provider-response.test.ts \
  src/product-review.test.ts src/product-review-submission-smoke.test.ts \
  src/local-basket-storage.test.ts src/local-basket-callback.test.ts \
  src/local-basket-capability.test.ts src/interfaces.test.ts \
  src/http.test.ts src/cloudflare-gateway.test.ts \
  src/picker/product-viewer-adapter.test.ts src/picker/viewer-page.test.ts \
  src/product-viewer-recovery.test.ts src/retired-product-viewer.test.ts
```

`pnpm --dir apps/nemlig-assistant exec tsx --test src/product-review-submission-smoke.test.ts` passed in isolation (1/1). `pnpm nemlig:smoke:review-ui` passed both MCP adapter and built-viewer synthetic flows after the documentation/package edits; `pnpm nemlig:smoke:package` passed on unchanged executable source before the plugin version bump. The packager rebuilt the tracked `0.1.8` ZIP, its four tests passed, and `unzip -tq` found no archive errors. None of these are native ChatGPT acceptance.

A same-command Fallow 3.32.0 health scan analyzed 130 app files (the Step 0 baseline had 128). It still flags `product-viewer.tsx`, `mcp.ts`, and `product-review.ts` as hotspots and suggests splits. Scores and fewer lines are not acceptance criteria; the retained submission/journal/callback complexity protects real write and auth boundaries. There were no new dependencies. The built viewer was 603.09 kB raw / 177.04 kB gzip in this local package build; this is a bundle measurement, not a user-latency measurement. No credentials, real account data, provider writes, persisted-data migration, plugin installation, merge or deployment were performed by this Step 6 branch.

## Parent #319 criteria and close decision

| Parent criterion | Disposition |
| --- | --- |
| Current model/plugin/docs; contracts cannot drift silently | Source and ZIP aligned by PR #328 and package/schema checks; installed package/native-host state **PENDING OWNER ACCEPTANCE** |
| Retire obsolete native-list/proposal modes | PASS: PR #329; read-only list source and historical receipts retained by design |
| One review wire contract | PASS: PR #330 `review-schema.ts`, MCP/schema/adapter tests; cached-card display variant is intentional |
| Simpler UI state with recovery/accessibility | PASS synthetic: PRs #330/#334 and review-UI smoke; native host **PENDING OWNER ACCEPTANCE** |
| Journal and write safeguards | PASS synthetic/local DO: PRs #331/#333/#335; production historical receipt population uninspected |
| Provider parsing vs transport | PASS source/tests: PR #332; documented `UnitPriceLabel` exception to literal output equivalence |
| Applicable safety matrix | PASS synthetic for named cases; live provider/host outcomes are separate manual acceptance, not inferred |
| Separate PRs and exact-head CI | PASS for Steps 0–5 and follow-ups; Step 6 PR-head CI is pending until this report PR runs |
| Current specs, package, runbooks, #295 disposition | Updated here; validation and PR review pending. #295 remains open and superseded by #317/#318 |
| Final simplification, retained complexity, follow-up | This record supplies the comparison and risks below; review/owner decision pending |

**Removed:** active native-list create/edit/transfer and proposal orchestration, fixed direct-mode branches, duplicate review field definitions and one unused host state mirror. Pure provider parsing no longer requires the session client in its tests. **Added:** one shared review schema, one pure provider-response module, focused tests and this integration record. **Retained:** one authenticated client, Auth0 before wake, per-principal context, fixed Container, current and historical durable receipts, old inert viewer resources, uncertainty classifications and add-only basket guards. Those obligations cannot be removed from source-only evidence. Moving code alone is not counted as simplification; the concrete gain is fewer active workflows and one place to maintain each wire or provider response rule.

| Risk | Status / impact | Evidence and next action / owner |
| --- | --- | --- |
| Installed plugin or cached cards may still advertise an older schema or UI | **PENDING OWNER ACCEPTANCE**; user can see stale or inert behavior | Owner/release operator: refresh current private package and MCP tools; use a fresh read-only ChatGPT conversation and [smoke guide](nemlig-chatgpt-smoke-test.md). Record observed version/resource/rendering. |
| Production Worker/Container may not serve the CI revision despite workflow success | **PENDING independent readback**; shipping status ambiguous | Release operator: compare a bounded read-only production revision probe with `b351ca0` under [readiness guidance](nemlig-production-readiness.md). Do not infer from GitHub job status alone. |
| Real Nemlig bulk response and concurrent external basket edits | **PENDING controlled provider acceptance**; fake-provider proof has limits | Owner: if live write acceptance is needed, authorize an exact controlled addition/readback separately. Do not retry an uncertain result or clear the real basket. |
| Historical unsettled receipts and cached viewer URI population | **Retained intentionally**; premature deletion could replay a write or confuse old cards | Production owner: only a separately reviewed, privacy-safe inventory and migration/retirement decision can change storage or URI compatibility. |
| Fallow hotspots in MCP/viewer/submission | **Deferred, not blocking** without a reproduced defect | Future scoped cleanup owner: require concrete coupling/testing benefit before another split. |

**Recommendation:** keep #319 open until the Step 6 PR is reviewed and the owner explicitly decides whether hosted/native acceptance remains an epic gate or becomes separately tracked work. Do not mark workflow deployment as ChatGPT acceptance, and do not close the epic merely because the code-level matrix is green.
