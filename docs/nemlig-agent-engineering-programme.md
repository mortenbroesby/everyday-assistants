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

## Iteration 2: withdrawn compact-schema experiment (#366)

Historical candidate `a9169eb`, starting from merged baseline `fbd78d8`,
advertised
Zod-native local `$defs`/`$ref` reuse. Their Standard Schema validation function
is unchanged by identity, including parsed outputs and unknown-key stripping.
Only output serialization is adapted; input schemas, tool annotations, result
payloads and provider behavior are unchanged. There are no new dependencies.
This preserves the existing logical contract, so no new OpenSpec requirement is
introduced. The helper isolates the serialization policy for direct testing.

The rejected experiment was a direct SDK `fromJsonSchema` substitution: it
rejected unknown keys that the existing Zod validator accepts and strips.
The implementation instead passes `libraryOptions.reused: "ref"` to Zod's
Standard JSON Schema output converter, retaining its target/options and the
original validator. References are local to each tool, never cross-tool.
See [Zod JSON Schema](https://zod.dev/json-schema) and the
[MCP 2026-07-28 tool contract](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx).

| Serialized JSON measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Full tools/list | 140,453 | 93,461 |
| Model-eligible catalogue entries (including metadata/output schemas) | 87,800 | 56,472 |
| All output schemas | 115,434 | 68,442 |

Tool counts remain 11 total / 8 model-eligible. All five discovery response
sizes and call counts above are unchanged. This is a 33.5% catalogue byte
reduction; it does not establish model token savings or routing improvement.
Native ChatGPT compatibility and actual model-context inclusion remain pending.

The size regression first failed against identity serialization, while the
validator-equivalence test passed. After implementation, 48 focused schema,
protocol, interface and synthetic submission tests passed; type checks and lint
passed. The schema test covers local reference resolution and identical parsed
results for valid, unknown-key and invalid values. The protocol dataset checks
that all six actual review-tool schemas advertise reusable definitions.
Final CI, release and native evidence belong in #366 and its PR, not inferred
from these local results. Existing English/Danish routing prompts in #347 remain
the native acceptance dataset; they were not executed by the protocol tests.

## Native Codex client compatibility checkpoint — 2026-11-27

Candidate `a9169eb5aa4de11b8837ba01393abfffec99477f`, draft #369 / #366.
A native Codex 0.169.0-alpha.11.1 app-server connected to the actual
`createMcpServer` using an injected synthetic provider and a loopback-only HTTP
endpoint. The SDK handler used `legacy: "stateless"`, matching production's
transport compatibility setting. Unrelated configured MCP servers and plugins
were disabled only in this probe process. No global configuration changed.

The native `mcpServerStatus/list` response reported connected and retained all
11 tools. All six review-tool output schemas still contained `$defs`. Native
`mcpServer/tool/call` successfully executed `find_groceries`,
`start_product_review` and `show_product_review`. The last two exercise compact
review output schemas. The returned draft/context handles were preserved and
the shown synthetic draft contained the exact one-product, quantity-one line.
Provider counters: one search, two detail reads, zero forbidden operations.
All other provider methods and provider-process fetch were throwing sentinels.
No `turn/start` was sent: zero model requests, no routing or token-savings claim.

The temporary fixture server and native client processes exited; the checkout
was clean before this evidence update. No credentials, real product data,
provider read/write, deployment or merge was used. The other four review tools
were discovered but not called. This establishes bounded Codex transport/tool
compatibility, not exhaustive client-side JSON Schema validation, ChatGPT
compatibility, rendering, or behavior improvement. Existing automated SDK
regressions remain the repeatable schema/validator safety checks.

### Reproduction outline and failed probes

1. Use the exact candidate with its pinned Node/pnpm dependencies. Reuse the
   synthetic Product/ShoppingClient shape from `src/agent-evaluation.test.ts`,
   adding a stable synthetic `providerIdentity`. Inject credentials and all
   nonfixture operations as throwing sentinels; never use the default provider.
2. Serve `createMcpServer` through `createMcpHandler` and `toNodeHandler` on
   `127.0.0.1` with an ephemeral port and `legacy: "stateless"`.
3. Use the bundled CLI's generated app-server JSON schema for the installed
   version. Initialize the native stdio API, send `initialized`, create a
   read-only thread and register the loopback fixture through process-only MCP
   configuration. Do not start a model turn or persist a connector.
4. Inspect `mcpServerStatus/list` for the fixture server, then call the three
   tools above. Map `review.draftId` / `review.reviewContextId` in structured
   output to `draft_id` / `review_context_id` input without guessing handles.
5. Assert exact line/handle readback and zero forbidden counters; close both
   processes and remove the temporary fixture from the working tree.

The first fixture launch used a wrongly nested relative path and exited with
module-not-found. The first native observer then timed out because quoted
configuration-key segments created an invalid MCP transport; the observer
initially hid stderr and did not notice process exit. Correcting the key path
and adding exit detection resolved that setup failure. No server call occurred
in those attempts. A subsequent fixture omitted provider identity, and draft
creation failed closed with “Direct basket identity is unavailable.” Adding
only a synthetic identity resolved it. Finally, the observer initially looked
for snake-case handles in camel-case structured output; reading the actual
returned contract corrected the probe. These are developer-probe failures, not
new demonstrated production incidents. Preserve them; do not install the
one-off observer as another repository runtime or weaken app validation.

### Stable native failure IDs

| Failure ID | Outcome | Reason |
| --- | --- | --- |
| NEM-CHATGPT-001 | NOT RUN | Codex MCP catalogue verified; installed ChatGPT catalogue/renderer not exercised. |
| NEM-CHATGPT-002 | NOT RUN | Successful draft roundtrip is not failed-edit recovery acceptance. |
| NEM-CHATGPT-003 | NOT RUN | No real or synthetic submission attempted. |
| NEM-CHATGPT-004 | NOT RUN | No uncertain-write recovery/quantity-baseline journey. |
| NEM-CHATGPT-005 | NOT RUN | No rendered submission progress. |
| NEM-CHATGPT-006 | NOT RUN | No rendered row controls. |
| NEM-CHATGPT-007 | NOT RUN | No rendered replacement affordance. |
| NEM-CHATGPT-008 | NOT RUN | No rendered language journey. |

## Decision: withdraw runtime compaction — 2026-11-27

The final branch restores the baseline MCP registration and removes the
serialization adapter and its implementation-specific tests. The five protocol
scenarios remain, with the diagnostic renamed from `modelToolsBytes` to
`modelEligibleCatalogToolsBytes`: these are serialized catalogue entries,
including metadata and output schemas, not measured model input.

The catalogue reduction above is real, but its intended model-context benefit
has not been demonstrated. Exact installed-version Codex source provides two
reasons not to ship on that measurement alone:

- [Responses API tool serialization](https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/tools/src/responses_api.rs)
  marks `output_schema` with `serde(skip)`; ordinary function declarations
  omit it. Catalogue output-schema savings do not establish savings on that path.
- [MCP result wrapping](https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/tools/src/mcp_tool.rs)
  nests the schema below `properties.structuredContent` without rebasing refs.
  The [type renderer](https://github.com/openai/codex/blob/rust-v0.169.0-alpha.11.1/codex-rs/code-mode-protocol/src/json_schema_types.rs)
  resolves fragment pointers from its root and falls back to unknown on misses.
  All six captured candidate schemas have five local refs and no `$id`.
  Five of five pointers resolve within each original schema; zero resolve from
  the wrapped root. This exposes a code-mode compatibility risk.

This is source-level and pointer-resolution evidence, not a demonstrated native
rendering regression. No installed generated declaration was captured. The
renderer has expansion budgets and a 16,000-byte final limit, so the baseline
might already lose detail; exact-version code-mode exposure also remains to be
verified. The independent read-only review confirmed these limitations and
recommended holding the draft or withdrawing an unproven optimization.

Decision: withdraw rather than maintain a runtime adapter or introduce a
speculative host workaround. Preserve both the successful bounded native probe
and this contrary evidence. No new dependency, runtime, schema contract or
provider behavior is introduced. This does not close #366: actual ChatGPT
context attribution and representative outcome trials remain outstanding.
Reconsider compaction only with before/after generated declarations and
equivalent agent outcomes demonstrating a useful benefit. No merge/deploy.

Withdrawal validation: all five real-SDK synthetic protocol cases passed;
catalogue bytes returned to 140,453 and model-eligible catalogue bytes to
87,800, with response sizes/call counts unchanged and zero forbidden calls.
`pnpm verify` passed (lint only); `git diff --check` passed. Relative to merged
`fbd78d8`, the final source diff contains only diagnostic naming/comment
changes in the evaluation test; `mcp.ts` is byte-identical to that baseline.
Full exact-head CI remains a separate delivery check.

## First model-routing pilot — 2026-11-27

Baseline runtime `7ac7167`, bundled Codex 0.169.0-alpha.11.1, confirmed
`gpt-6-astra`, existing ChatGPT authentication, two fresh read-only threads.
The same loopback synthetic fixture described above seeded one product with
quantity one per thread via native API, outside the measured model turn.
The user message was exactly `Active temporary draft: draft_id=<seeded ID>,
review_context_id=<seeded ID>.` followed by one of the matrix prompts below.
Only the fixture MCP server was enabled in process configuration; plugin tools
were disabled. No API-key evaluation, real provider or basket operation.

Predefined success: select display, preserve both supplied handles, return the
seeded one-line draft, and make no provider mutation. A selected display tool
alone is insufficient. Recorded completed native items gave:

| Prompt | Outcome | MCP calls / shell calls | Elapsed | Input / cached / output tokens |
| --- | --- | --- | ---: | --- |
| Show my draft | PASS: exact handles, seeded draft returned | 1 / 1 | 18.28 s | 137269 / 111488 / 275 |
| Vis mig listen | FAIL: display selected, handles omitted, unavailable returned | 1 / 1 | 20.26 s | 136158 / 110976 / 312 |

Each shell call successfully read a shopping skill: the English trial used the
repository Nemlig basket skill; the Danish trial used the installed grocery
shopping plugin skill. These instructions remained discoverable despite
process-level plugin tool disabling. This is an observed context difference,
not proof that either skill caused the omitted handles. Both model turns
completed without a retry. Aggregate provider counters were zero searches,
two detail reads for seed creation, and zero forbidden operations. English
returned the synthetic item; Danish reported unavailable without recreating or
submitting. Native events attached the shell resource URI but no rendered UI
was observed. NEM-CHATGPT-001 through -008 remain NOT RUN.

This is one run per prompt under a developer-oriented Codex harness, not a
ChatGPT production success rate, language comparison or candidate improvement.
Usage is the final cumulative native token counter, not catalogue bytes;
elapsed values include model/tool execution, exclude seeding and startup, and
are not cost or latency comparisons. Raw local synthetic traces are excluded
from version control. Native client and fixture server were stopped.

Next regression: repeat both prompts with the same explicit-handle context and
record skill selection, exact arguments and result independently. Then compare
with a matched skill/context condition before changing tool descriptions or
instructions. Never weaken the exact-target ownership guard to make omitted
identities appear successful. The existing display matrix supplies this case;
no competing evaluation framework is needed.

### Reversed-order replication

Repeated the same fixture, model, prompt construction and fresh-thread procedure
at `2b5e1ff` (runtime unchanged), Danish then English. Both completed one
successful skill read and one show_product_review call with only
`view: "draft"`; both omitted the supplied identities, returned unavailable
and did not retry. Danish read the current repository skill; English read the
installed 0.1.5 skill. Thus stale skill selection alone does not explain the
failure, and English can fail too.

| Prompt | Outcome | Elapsed | Input / cached / output tokens |
| --- | --- | ---: | --- |
| Vis mig listen | FAIL: omitted supplied identities | 13.96 s | 139952 / 113024 / 235 |
| Show my draft | FAIL: omitted supplied identities | 21.40 s | 139281 / 112640 / 232 |

Across these four exploratory trials, display selection was 4/4 and exact-target
completion 1/4. This is a small local baseline, not a population estimate or
ChatGPT acceptance. The repeated fixture recorded two seed detail reads and
zero searches/forbidden operations. Both native processes stopped; no installed
skill or host configuration was changed.

Inspection found the display tool's main description explains intent/exclusions
but does not tell the model to carry available identities. The edit description
does. Next bounded candidate: add that exact-target guidance to the display
description and repeat the same four cases/order, retaining schema optionality
for genuinely trusted conversation fallback. Do not infer improvement from a
description-string test. The installed skill mismatch is separately recorded
in draft #371's friction ledger; it is not established as this failure's cause.

## Candidate: clarify known identity forwarding

A description-only candidate after `baf691c` explicitly tells callers to pass
available draft_id/review_context_id unchanged and reserves omission for
trustworthy host context. No schema, validation, ownership, fallback, provider,
or payload behavior changes; this clarifies the existing contract rather than
introducing an OpenSpec contract. Catalogue bytes increase by 230 to 140,683;
the model-eligible entry array increases to 88,030. Byte reduction is not the
objective of this correction.

Repeated the same four fresh-thread prompts in baseline order (English,
Danish, Danish, English), same native model/version, synthetic fixture,
seeding and grading. Only the display description changed in runtime source.

| Prompt / order | Exact-target outcome | MCP / shell calls | Elapsed | Input / cached / output |
| --- | --- | --- | ---: | --- |
| English 1 | PASS | 1 / 2 | 21.92 s | 139288 / 112384 / 377 |
| Danish 2 | PASS | 1 / 1 | 22.93 s | 138982 / 126592 / 329 |
| Danish 3 | PASS | 1 / 1 | 20.24 s | 137964 / 126080 / 322 |
| English 4 | FAIL: omitted identities, unavailable | 1 / 1 | 18.05 s | 134789 / 110336 / 260 |

The first read both installed and repository skills; the other three read the
installed 0.1.5 skill. All skill reads exited zero. All selected display;
successful calls preserved the exact returned identity pair and one-item draft.
No model retry occurred. Fixture counters: four seed detail reads, zero
searches and forbidden operations. Native processes exited and temporary
fixture source was removed.

Observed exact-target completion is 3/4 versus baseline 1/4. Four samples per
condition, sequential collection, variable skill reads and caching are too weak
to establish a robust causal improvement or efficiency gain. The remaining
failure is preserved. Retain the small clarification in draft for further
replication; do not mark the routing defect resolved or weaken validation.
ChatGPT native rendering and failure IDs remain untested.

Validation: five protocol scenarios and 40 interface tests passed, plus lint
and diff checks. The initial test command included a nonexistent mcp.test.ts
path but tsx ran only the five existing protocol cases; the actual interface
suite was then located and run separately. The first candidate observer exited
before the fixture wrote its ready URL (zero model turns); after confirming
server readiness, the observer was restarted. These are harness setup friction,
not model failures. Latest exact-head CI remains separate.

## Reproducible fixture and grading handoff

The temporary probe is now preserved as
`apps/nemlig-assistant/scripts/agent-routing-fixture.ts`, using only existing
SDK dependencies, loopback, injected synthetic data and throwing provider/
credential/fetch boundaries. It does not own a model loop or start inference.
The two prompts are versioned in `src/fixtures/agent-routing.json`; the
[native evaluation runbook](nemlig-routing-evaluation.md) specifies readiness,
seeding, native configuration, exact message construction, observation bounds,
grading, counters, shutdown and known confounders.

The fixture integration check confirms exact seeded readback, unavailable when
handles are omitted, and rejection of a forbidden basket-read attempt. That
deliberate check expects one forbidden call; model trials still require zero.
Regraded all eight saved synthetic trial traces against the identities in the
original seeded-context user message, independently of returned output:
baseline 1/4, candidate 3/4 unchanged. No additional model trials were needed.

Implementation checks first exposed missing explicit Node imports under the
repository's JavaScript lint policy and an uncleared test deadline keeping the
test process alive for 25 seconds. Added the imports and cleared the deadline
after child exit. These were test-harness defects, not production behavior or
new model-routing failures. The fixture and observer processes are stopped.

Final fixture check passed in 2.79 seconds including process startup/shutdown;
lint and diff checks passed. A deliberate mutant replacing the throwing basket
reader with an empty-result function failed on the missing forbidden-call
counter, and restoring the guard passed. This validates that the check detects
an accidentally enabled provider path. Prior description head `02e702c`
passed full exact-head CI run 45917587441; the new harness head requires its
own CI result.

The first commit gate rejected the fixture as unreachable because the test
launches it by child-process path. Added the explicit package script
`eval:routing:fixture` and updated the runbook rather than suppressing Fallow.

## Committed-fixture replication and CI correction

At runtime head `f66b227`, repeated the same four cases using the committed
fixture/package command and versioned dataset, with unchanged native host,
model and grading. All four returned the independently seeded identities and
one-item draft:

| Order | Outcome | MCP / shell calls | Elapsed | Input / cached / output |
| --- | --- | --- | ---: | --- |
| English 1 | PASS | 1 / 2 | 24.76 s | 139200 / 112384 / 365 |
| Danish 2 | PASS | 1 / 1 | 21.64 s | 140473 / 127488 / 282 |
| Danish 3 | PASS | 1 / 1 | 21.84 s | 139815 / 126976 / 301 |
| English 4 | PASS | 1 / 1 | 22.85 s | 140626 / 127488 / 302 |

The first read both installed and repository skills; the second/fourth read
repository guidance; the third read installed 0.1.5. All commands succeeded,
with no model retries. Candidate aggregate is now 7/8 versus earlier baseline
1/4, without balanced sample sizes, interleaving or controlled skill selection.
This supports retaining the small clarification for review; it does not prove
a general success rate, causation, token savings or ChatGPT UI acceptance.
The fixture principal string changed from the temporary probe to the committed
synthetic name; no real identity or provider data was involved.

CI run 45918033241 at `f66b227` failed type checking: providerIdentity was
annotated as a member of ShoppingClient, but belongs to ShoppingListClient.
Corrected the fixture annotation to the intersection with
Pick<ShoppingListClient, "providerIdentity">. This is type-only; the running
replication used the unchanged runtime. Local app/UI type checks and the
fixture integration test then passed. Parallel CI tests were cancelled after
the type failure; do not count them as independently diagnosed regressions.

Fresh remote inspection found main `53a594e`, including MCP server 2.3.1 /
Node adapter 2.1.1 in #354. This branch's model trials used server/Node adapter
2.0.0. Do not silently attribute these measurements to current-main
dependencies. Dependency alignment and revalidation are the next integration
step; no main merge or production action is implied. Friction draft #371 at
`3aa1158` passed exact-head CI 45917295848.

## Current-main dependency alignment and negative cases

Updated only the feature branch with main `53a594e`, producing local
integration commit `8549fe4`; no PR was merged into main or deployed.
Frozen installation reused the lockfile. MCP server is now 2.3.1 and Node
adapter 2.1.1; unrelated main changes were preserved. All 46 focused
protocol/interface/fixture checks passed with these dependencies, and lint
passed. Earlier 2.0.0 model measurements remain version-specific.

Expanded the committed dataset with expected context and outcome fields plus
two cases already required by the display acceptance matrix: explicit
text-only explanation and ambiguous list display without a supplied target.
Each fresh thread still seeded a synthetic draft before the model turn, but
the ambiguous case received no identities. Same native Codex/model and grading;
one trial per case:

| Case | Outcome | MCP / shell calls | Elapsed | Input / cached / output |
| --- | --- | --- | ---: | --- |
| Explicit draft, English | PASS: exact seed identities | 1 / 1 | 18.47 s | 139808 / 126976 / 320 |
| Explicit draft, Danish | PASS: exact seed identities | 1 / 1 | 19.51 s | 139798 / 126976 / 307 |
| Text-only explanation | PASS: explained draft/basket distinction, no tool call | 0 / 0 | 8.52 s | 26569 / 26368 / 56 |
| Ambiguous list, no target | PASS: asked which list, no tool call | 0 / 0 | 9.59 s | 26505 / 26368 / 36 |

No retries or failed commands. Fixture shutdown counters: four seed detail
reads, zero searches and forbidden calls; both processes exited. These are
four observed passes under the newer dependency set, not another baseline/
candidate comparison. Do not pool them silently with older-dependency results
or infer ChatGPT rendering, token efficiency or general reliability.

Remaining cases include stale contexts, uncertain submission display, indirect
requests, actual-basket distinction and broader language variation. Inspection
also found the generic unavailable text recommends new-draft creation without
mentioning known handles; missing context is not proof that the draft expired.
Consider a narrowly scoped recovery-message evaluation under #347, preserving
exact-target ownership and no implicit reconstruction. No recovery behavior
changed in this iteration.

## Unavailable-context guidance: deterministic and native evidence

Earlier omitted-handle trials received a message recommending new-draft
creation even though the seeded draft still existed. The existing OpenSpec
safe-target requirement already requires actionable no-target guidance. The
change preserves target lookup, ownership, rejection and structured
unavailable=true, but explains one corrected read-only call when this call
omitted known handles. Otherwise it asks for clarification. An unavailable
explicit target does not invite unchanged retry or reconstruction.

The fixture regression first failed on the old text, then passed after the
change; it verifies the same seeded draft/rows are still available through the
correct pair. A second failing-then-passing check covers syntactically valid
but nonexistent handles: the shared review-owner error previously asserted
expiry and suggested refreshing a shopping list. It now truthfully reports
that the exact draft review context is unavailable. It retains the existing
UI's draft-unavailable wording recognition; no UI classifier changed.

Two native baseline trials used never-issued UUIDs (not a simulated clock
expiry) with a separate hidden seeded draft. Both sent the supplied pair and
made no fallback or mutation. However, both final answers asserted expiry; the
English answer suggested reopening the temporary draft on Nemlig, which is
not a supported recovery path. The correction was then evaluated with the same
two cases and model/host/dependencies:

| Condition / prompt | Initial targeting / recovery / final explanation | MCP / shell calls | Elapsed | Input / cached / output |
| --- | --- | --- | ---: | --- |
| Before / English | Exact target rejected; false expiry and reopen suggestion | 1 / 1 | 17.07 s | 136166 / 125440 / 283 |
| Before / Danish | Exact target rejected; false expiry explanation | 1 / 1 | 23.16 s | 139991 / 127360 / 236 |
| After / English | Omitted handles, then one corrected exact call; truthful unavailable | 2 / 1 | 20.64 s | 172219 / 161536 / 315 |
| After / Danish | Exact target rejected; truthful unavailable | 1 / 1 | 17.89 s | 138358 / 126592 / 275 |

This distinguishes first-attempt targeting (before 2/2; after 1/2), safe
rejection/no recreation (both 2/2), and factual final explanation (before 0/2;
after 2/2). The English corrected call is an observed recovery, not an unchanged
retry or provider write. Do not flatten these into a single success score or
claim efficiency gains: one trial incurred an extra tool call and more tokens.
Two trials per condition are insufficient to establish general improvement.

Each fixture recorded two seed detail reads, zero searches and forbidden
operations. Native clients and servers stopped. No card rendering, genuine
TTL expiry, uncertain submission or real provider action was tested.
NEM-CHATGPT-001 through -008 remain NOT RUN. Updated cases/runbook preserve
the setup and limitations.

Validation: 41 fixture/interface tests passed after the functional text change;
the final fixture check passed again after preserving the UI-recognized
draft-unavailable wording. Lint and diff checks passed. Earlier dependency-
aligned head a249960 passed full CI 45918835537; this new head requires its
own exact-head result. No new durable schema, dependency or agent runtime.

## Real service TTL in the synthetic fixture

The earlier invalid UUID cases did not simulate expiry. The fixture now offers
an opt-in --expired-draft mode using ProductReviewService's existing injected
clock: create one valid synthetic draft, retain only its exact handles in the
readiness record, then advance the service clock three hours past its two-hour
idle TTL. The normal mode is unchanged. No new control endpoint, dependency,
production flag or model loop was introduced.

The new fixture test first failed because the mode did not exist. Both modes
then passed exact boundary/counter checks. A mutant removing the clock advance
made the expired case return a valid draft and fail the rejection assertion;
restoring the advance passed. Thus the result depends on TTL expiry, not merely
a fabricated or incorrectly owned handle. Type checking exposed an optional
Product.id and an untyped argv callback; a fixed synthetic ID constant and
explicit callback annotation resolved them. App/UI type checks and lint passed.

Native Codex gpt-6-astra, same version/dependencies as the preceding batch,
two fresh threads using the once-valid expired handles:

| Prompt | Exact-target rejection / effects | Recovery explanation | MCP / shell calls | Elapsed | Input / cached / output |
| --- | --- | --- | --- | ---: | --- |
| English | PASS; no fallback/recreation | Reported unavailable, no unsupported next action | 1 / 1 | 18.30 s | 139287 / 112640 / 294 |
| Danish | PASS; no fallback/recreation | Suggested reopening the expired draft for a new reference; unsupported in this fixture | 1 / 1 | 22.90 s | 137077 / 125952 / 305 |

Do not count the Danish journey as fully successful merely because its tool
selection and safety passed. The remaining recovery-advice failure is preserved;
do not respond automatically with another instruction. This is two observations,
not a general language comparison. Fixture shutdown: one initial seed detail
read, zero searches/forbidden operations. Native client/server exited. No live
provider, real basket, ChatGPT rendering or uncertain-submission state was tested.

## Recovery capability audit (2026-11-27)

At 864d5ed, ProductReviewService.expireDraft deletes the stored review;
reviewContextOwner prunes expired entries before resolving handles. An exact
refresh cannot reconstruct expired products or approval. The existing service
regressions for passive refresh/expiry and stale-card isolation both passed.
The product-review and ChatGPT integration specifications explicitly forbid
silent reconstruction after expiry or restart.

The viewer directDraftFailureMessage nevertheless advised refreshing before
continuing for expired, unavailable, changed and transport failures alike.
Its refreshCurrentDraftList performs an exact update_product_review/show read;
it does not create a replacement. Recovery copy now distinguishes that read
from restoration while preserving the existing control and safety state.
A focused regression failed against the old copy and covers expiry,
unavailability, changed identity, transport failure and private-text exclusion.
This is a UI explanation correction, not evidence that the UI caused the
Danish model advice or that model recovery reliability improved. No new native
model or provider trial was performed for this copy correction.

Validation: both existing service lifetime regressions and all 15 viewer adapter
tests passed; lint passed with zero warnings/errors. Full CI and rendered-host
acceptance for this new copy remain separate from these local checks.
