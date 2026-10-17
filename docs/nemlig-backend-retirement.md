# Nemlig backend workflow retirement (issue #322)

This is the Step 2 implementation record for [#319](https://github.com/mortenbroesby/everyday-assistants/issues/319), stacked after the [#321 contract PR](https://github.com/mortenbroesby/everyday-assistants/pull/328). The source-level starting map is [#320's baseline](nemlig-architecture-refactor-baseline.md). It describes reachability and the intended safety boundary, not live Nemlig acceptance.

## Candidate decisions

| Candidate | Decision and evidence | Safety boundary |
| --- | --- | --- |
| Native-list create/edit/update/transfer methods in `ProductReviewService` | Remove. `mcp.ts` fixed direct mode made their callers unreachable; the only remaining references were tests and the synthetic fixture. Current CLI calls the provider client directly. | Preserve read-only saved-list discovery/load as a source for a temporary draft. Leave historical journal records and callback/storage parsing untouched. |
| Native fallback branches in `mcp.ts` | Remove the unreachable branches and fixed-mode conditionals. The update path rejected `shopping_list_id` before its old native handler could run. | Preserve current tool names, schemas, conditional visibility, rejected legacy arguments, and inert viewer URIs from #321. |
| `BasketProposalService` and its HTTP/MCP injection | Remove. Active direct Submit calls `addManyToCart` through `ProductReviewService` and uses a durable journal claim; no live path calls proposal preparation/application. | Retain the result payload and uncertainty error used by direct Submit. Retain provider bulk-add and no-retry/readback tests. |
| Client helpers exposed only to the retired proposal tests | Remove unused source exports and the uncalled list fingerprint. The remaining basket fingerprint and normalization helpers stay local to the provider client. | `NemligClient.getSessionGeneration` remains: `runtime.ts` calls it through a structural type to fence stale-session reads, which static member analysis does not see. |
| Proposal/native-list tests | Remove tests solely exercising retired execution. | Keep direct draft, owner/account, source-read-only, single bulk write, independent readback, receipt/restart/uncertainty, optional whole-basket save, MCP, HTTP, and UI smoke tests. |
| `ProductReviewSnapshot` legacy fields, UI states, persisted review operations | Defer to Stage 3/4. Existing cards and records may still contain these shapes. | No stored-data/key/retention migration or deletion in this PR. |
| Provider native-list methods | Defer to Stage 5. Other public/CLI callers and provider contracts need separate analysis. | No provider API or credential behavior changed. |

The supported workflow remains search or read-only saved-list sourcing, process-local direct draft, local edits, exact authorization, one additive `AddManyToBasket` request, independent readback, no replay after uncertainty, and optional explicit save of the entire actual basket as a list. No account write was used for this retirement.

## Verification record

Baseline before edits: 159 focused tests passed across product review, proposals, MCP interfaces, HTTP, and submission smoke. Final focused tests, type/build/format/smoke and exact-head CI are recorded in the PR and issue after they run. A passing synthetic suite cannot establish live ChatGPT or provider acceptance.

## Follow-up boundary

Stage 3 owns shared review schemas and React state. Stage 4 owns the durable journal and historical receipts. Stage 5 owns provider client parsing and validation. This PR does not treat an old receipt as safe to delete because its native caller disappeared.
