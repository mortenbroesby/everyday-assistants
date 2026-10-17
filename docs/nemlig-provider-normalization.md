# Nemlig provider response normalization (issue #325)

This Step 5 implementation record for [#319](https://github.com/mortenbroesby/everyday-assistants/issues/319) is stacked on [PR #331](https://github.com/mortenbroesby/everyday-assistants/pull/331). It follows the [architecture baseline](nemlig-architecture-refactor-baseline.md), [backend retirement record](nemlig-backend-retirement.md), and [journal compatibility decision](nemlig-operation-journal-compatibility.md). The private Nemlig API is observed, not published; the existing endpoint manifest remains the source-path inventory.

## Responsibility and compatibility

| Before | After | Reason |
| --- | --- | --- |
| `client.ts` owned provider record coercion, bounded product HTML parsing, department/list/basket normalization, and the authenticated client. Pure parser tests imported the stateful client module, including `node:crypto`. | `provider-response.ts` owns only deterministic response normalization and its value readers. `provider-response.test.ts` imports it directly without `NemligClient` or session/HTTP setup. | A provider response-shape change can be characterized and updated at a pure boundary; the stateful client remains one cohesive owner of requests. |
| `client.ts` exported `Product`, `Basket`, list and department types plus `normalizeProducts`/`normalizeDepartments`. | The same names remain re-exported from `client.ts`; current CLI, MCP, discovery, presentation, benchmark and test imports remain valid. | Preserve supported import and package contracts while providing an isolated parser import for new tests. |
| Basket fingerprint, positive-delta validation, readback, cache, login, CSRF, fetch, retries, and provider writes lived in `client.ts`. | They remain in `client.ts` with the same call sites and order. | Their effects and safety constraints are not part of pure response parsing. |

`provider-response.ts` adds one module and no dependency, schema pipeline, client instance, network call, or state. It reuses the existing `html-to-text` and Zod behavior. Product field mappings, tri-state availability, Danish labels, HTML limits, list identity/quantity/duplicate checks, basket unknowns, department paths and normalized output order were moved unchanged. The only comment edit clarifies that saved lists are read-only sources for process-local drafts. Historical architecture-baseline links remain historical evidence rather than being rewritten as current source locations.

The generic value readers are still called by `NemligClient` for login and session responses. A future change to those readers needs the existing client/auth tests as well as parser tests. Fallow classifies the relocated product-field callback as newly complex because it has a new file path; the one-line suppression applies only to that unchanged mapping, rather than adding helper layers to satisfy a relocation artifact.

## Verification and limits

At the PR #331 base (`f02a5f0`), 111 focused client/discovery/presentation/interface/submission tests passed and `check:api` reported 29 operations (23 client-used, 6 observed-only). After extraction, the same 111 tests and API inventory passed; five direct pure-module tests cover unknown availability, bounded text, list identity/row/duplicate rejection, incomplete inventory, basket unknowns and unsafe department paths. TypeScript app/UI checks passed. The existing product-text benchmark, one run per revision on Node 24.13.0, measured a 41-field product median of 73.9 ms before and 79.0 ms after, with p95 176.0 and 185.4 ms; parser implementation and workload were unchanged, and a single run does not establish a performance trend or win. Exact commands and final CI status belong in the PR handoff.

No credentials, live Nemlig requests, production Durable Object data, provider writes, deployment, or migration were used. Existing synthetic tests and CI verify supported code contracts; they cannot establish that every undocumented future provider response will match current fixtures.
