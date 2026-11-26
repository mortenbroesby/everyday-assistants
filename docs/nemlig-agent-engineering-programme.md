# Nemlig agent engineering programme

Established 2026-11-26. Delivery and prioritisation contract:
[#365](https://github.com/mortenbroesby/everyday-assistants/issues/365).
This is a living evidence record, not a claim of native ChatGPT acceptance.
The principal agent owns integration. Review priorities after each iteration
and each new incident; keep GitHub task status authoritative.

## Execution baseline

Source baseline: `7b981d4`, Node 24.13.0, pnpm 9.15.9, MCP SDK 2.0.0.
The external host owns model inference, conversation context and tool choice.
Nemlig does not run an application-owned LLM loop. Hosted requests pass through
Worker authentication/routing and HTTP SDK handling to `createMcpServer` in
`src/mcp.ts`; stdio exposes the same catalogue. Request principal and application
storage own continuity, not the transport session.

`find_groceries` validates its Zod input, invokes `runAuthenticatedRead`, and
calls `resolveDetailedProductSearch`. The client performs a provider search;
request-local Effect coordination hydrates unique product IDs with bounded
concurrency, cancellation and partial-failure handling. Presentation creates
normalized candidates, views and text. It preserves provider order and facts;
`rankProducts` is a projection despite its historical name. Search cannot prove
catalogue completeness. Authentication recovery belongs to the runtime read
boundary, not a model-generated retry loop.

Review display, draft edits and basket submission are different operations.
`show_product_review` is read-only; submissions use exact reviewed identities,
operation journals and additive readback. Uncertain writes must not be replayed.
See the canonical [MCP specification](../openspec/specs/nemlig-mcp/spec.md),
[discovery decision](effect-product-discovery-evaluation.md),
[architecture closeout](nemlig-architecture-refactor-closeout.md),
[review contract state](nemlig-review-contract-state.md), and
[failure compendium](nemlig-failure-compendium.md).

Existing issue ownership remains intact: #319/#326 architecture integration,
#347 native review display, #357 uncertain-submission diagnosis, #241 relevance.
Open PRs inspected at programme start were dependency updates (#352–356,
#360, #362, #364); none owned this evaluation change. Existing worktrees remain
untouched. The repository index was stale, so current source was inspected.

## Authoritative practice comparison

Sources reviewed 2026-11-26; these are design comparisons, not comparative
performance claims. No framework benchmark was run.

| Reference | Applicable practice | Nemlig assessment and decision |
| --- | --- | --- |
| [OpenAI Agents SDK testing implementation/docs](https://github.com/openai/openai-agents-python/blob/main/docs/testing.md), [tracing](https://github.com/openai/openai-agents-python/blob/main/docs/tracing.md) | Deterministic substitutes isolate workflow behavior; tracing makes execution inspectable. | Use the installed MCP client/server with a synthetic provider. Keep provider values out of diagnostics. A new agent SDK would duplicate a loop owned by the host; do not install one. |
| [Anthropic evaluation guidance](https://www.anthropic.com/research/demystifying-evals-for-ai-agents), [tool engineering](https://www.anthropic.com/research/writing-tools-for-agents) | Grade outcomes and effects, maintain realistic regression tasks, inspect trajectories and tool-context cost. | Existing unit tests are strong safety evidence but not model-routing evidence. Add reusable cases at the actual protocol boundary and retain separate native prompt trials. |
| [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) | Select useful context and retrieve information when needed. | Measure catalogue and response components before compression. No speculative vector database: the provider already owns catalogue search. |
| [Vercel AI SDK](https://github.com/vercel/ai), [agent loop documentation](https://ai-sdk.dev/docs/agents/overview) | Native tool-loop and context facilities serve applications that own inference. | Reuse SDK capabilities if a future requirement introduces an owned loop. Today preserve native MCP protocol handling and explicit application state instead of introducing an agent factory. |
| [LangChain Deep Agents implementation](https://github.com/langchain-ai/deepagents), [overview](https://docs.langchain.com/oss/javascript/deepagents/overview) | Planning, filesystem context and delegation support complex long-running agents. | Those mechanisms have no demonstrated benefit for this MCP service. Borrow the explicit-context and evaluation discipline, not the orchestration stack. |

## First improvement: protocol evaluation dataset

The first implementation is a five-case synthetic regression dataset in
`src/fixtures/agent-discovery.json` executed by `src/agent-evaluation.test.ts`.
It uses the existing SDK over loopback HTTP and exercises real tool discovery,
argument validation, tool execution, structured output and error sanitization.
The provider is synthetic; forbidden provider methods and credential loading
are counted and rejected. No service credentials, provider traffic, model calls,
telemetry exporter or new dependencies are needed. CI already includes this file
through `src/*.test.ts` and `.github/workflows/ci.yml`.

Why first: it gives repeated, inspectable measurements at the agent-facing
boundary before changing contracts. It adds dataset ownership and protocol-level
call/cost evidence to existing focused discovery tests. It is not a live agent
success-rate benchmark, and does not fix #241.

Reproduce from the repository root:

```sh
pnpm --filter nemlig-assistant exec tsx --test src/agent-evaluation.test.ts
pnpm verify
```

The test runner emits JSON diagnostics per case. Byte counts are UTF-8 lengths
of JSON serialization after SDK decoding, not HTTP wire framing, tokens or
proof of what ChatGPT sends to its model. Timings vary with local load and are
not latency SLOs. Size measurements are report-only until #366 establishes an
outcome-backed budget; behavior assertions are regression gates now.

| Case | Search calls | Detail reads | Response bytes | Result |
| --- | ---: | ---: | ---: | --- |
| Empty response | 1 | 0 | 1,459 | Successful empty, not an error |
| Provider order and duplicate IDs | 1 | 3 | 3,819 | Order preserved, duplicate detail read avoided |
| Partial detail failure | 1 | 3 | 3,119 | Two candidates and one explicit unavailable view |
| Search failure | 1 | 0 | 1,433 | Error, private exception text absent |
| 25 unique products | 1 | 25 | 21,383 | All returned, no hidden application cap |

All five passed; all forbidden-call counts were zero. A temporary mutation removing
the unique-ID guard failed the duplicate case with detail calls `[1, 2, 3, 3]`
instead of `[1, 2, 3]` (exit 1). The original source was restored immediately. Catalogue: 11 tools,
140,453 bytes. Eight tools advertise model visibility: their serialized array
is 87,800 bytes. Output-schema array across all tools: 115,434 bytes. These
components overlap; do not add them together. Host filtering remains unverified.

## Priorities and measurement plan

| Priority | Work | Acceptance measurement and uncertainty |
| --- | --- | --- |
| P0 | #365 first dataset/harness | Five protocol cases pass; a deliberately broken deduplication implementation must fail. Expand from observed incidents rather than test-count targets. |
| P1 | [#366 context contracts](https://github.com/mortenbroesby/everyday-assistants/issues/366) | Break down schema/instruction/result costs; compare identical cases and #347 routing prompts before/after. No removal of validation or product rows to meet a size score. |
| P1 | [#241 relevance](https://github.com/mortenbroesby/everyday-assistants/issues/241) | Review Danish query/product judgments; measure precision@5 and irrelevant-category rate. Include oat drink versus confectionery, brands, broad queries and no-match cases. Provider recall and current incident reproducibility are unknown. A synthetic fixture cannot establish live retrieval quality. |
| P1 | [#347 routing](https://github.com/mortenbroesby/everyday-assistants/issues/347) | Reuse its English/Danish prompt matrix; record fixed model/version, repeated trials, selected tools, task outcome and unauthorized effects. Baseline NOT RUN; native host/model access and cost bounds must be established first. |
| P2 | [#357 reliability](https://github.com/mortenbroesby/everyday-assistants/issues/357) | Track sanitized operation stages, failure classes, recovery outcomes and exact quantities. Existing synthetic tests do not explain the historical provider failure. Live acceptance remains separate. |
| P2 | Simplicity/native reuse | For each observed maintenance problem record dependencies/concepts removed, preserved contracts, focused checks and before/after effect counts. No speculative factories, vector stores or multi-agent runtime. |

An iteration records baseline SHA, dataset version, environment, commands,
outcomes, failures, candidate diff and uncertainty in its PR, then updates #365.
Keep held-out relevance judgments separate from tuning cases. Review expected
outcomes before adding incidents to the dataset. Do not weaken assertions or
rebaseline simply to make a candidate pass. Require a bounded cost decision
before any paid model experiment. All fixture data is synthetic and public-safe.

## Scope and gates

Definition of Ready: scope is test fixtures and programme documentation;
acceptance is executable protocol outcomes and forbidden-effect counts; runtime
and GitHub access checked; isolated worktree based on current main; frozen
install performed. No runtime contract changes, so a new OpenSpec change is
inapplicable. UI, production, provider and basket mutations are out of scope.
There is no shipped feature change requiring a README feature inventory update.

Definition of Done: focused suite and lint required; formatting and diff review
required; CI owns broad checks. Commit, remote branch and draft PR evidence must
be recorded in #365. Merge/deployment/native acceptance are not implied.

For this discovery-only run, NEM-CHATGPT-001 through NEM-CHATGPT-008 are NOT RUN:
no native rendering, submission, recovery UI or language journey was exercised.
Their existing evidence and outstanding acceptance remain in the compendium.
