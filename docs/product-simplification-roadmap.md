# Product simplification roadmap

Status: proposed roadmap, 2026-09-09; feature-request removal implemented in source
as the first owner-selected deletion, followed by removal of all saved shopping.
Production acceptance remains pending. Scope: Nemlig Assistant in Everyday Assistants.
Baseline: `a9306603c8f66f8631db3ce33c643729db133933` on remote main.
Origin: the requested review of “Simplify Everyday Agents Code”; this document
expands and checks its recommendations without copying the private conversation.

## Outcome and definition of done

Make everyday grocery journeys require fewer orchestration decisions from ChatGPT
and fewer concepts from maintainers, while retaining every authorization, privacy,
freshness and cost boundary. Success means measured simpler journeys and fewer
independent implementations, not a target file size or exactly a fixed MCP tool count.

This deliverable is planning only. Each non-trivial delivery slice needs its own
reviewed OpenSpec proposal, characterization or failing behavior test, focused
checks, full `pnpm verify`, integration and applicable acceptance. Provider changes,
real-user data migration and basket changes retain their existing authority gates.
The original roadmap authorized no runtime change. The subsequent explicit
feature-request and saved-shopping removals are tracked separately; SDK upgrades
and infrastructure migration remain proposed.

## Findings checked against the roadmap baseline

| Original direction | Current evidence | Roadmap consequence |
| --- | --- | --- |
| Finish P2 maintenance first | [P2 evidence](../openspec/changes/p2-simplify-nemlig-maintenance/evidence.md) records all nine repository stories integrated with 210 tests and exact-head CI; live acceptance and archive remain open. | Do not repeat parser, coverage, CLI decoupling, output-schema or pure-calculation work. Reconcile acceptance under its existing owner. |
| Thin MCP adapters around application functions | [mcp.ts](../apps/nemlig-assistant/src/mcp.ts) still defines `resolveRun`, addition aggregation, list-to-run conversion and ranking beside registration and presentation. It already injects `BasketProposalService` and `ShoppingClient`. | Extract only a demonstrated shared workflow; reuse existing functions and dependency seams. No mandatory `NemligAssistant` class or forwarding facade. |
| Fewer product actions | At the roadmap baseline there were 22 registration sites, including a helper used for four approved actions and a conditional visual picker. Four executable names map to three entrypoint files. | That baseline exposed 25 tools with the visual picker enabled, 24 without it. Measure actual `tools/list`; registration sites and executable names are not implementation counts. |
| Unify plans and lists | The baseline contained immutable snapshots and named-list lifecycle APIs. | Superseded by the owner decision to remove both, with no native Nemlig-list integration now. |
| Replace review/apply with protocol confirmation | [proposals.ts](../apps/nemlig-assistant/src/proposals.ts) owns business guarantees that transport confirmation does not supply. Current automatic runs already carry scoped same-run authorization. | Simplify the host interaction only after compatibility proof; keep the mutation engine. Never turn a model-supplied boolean into consent. |
| Move directly into a Worker | [hosting assessment](cloudflare-hosting-assessment.md) records in-memory sessions and persistent storage needs. Feature-request submission and its `gh` subprocess have since been removed. | Runtime compatibility is an end-to-end spike, not an SDK version check. Feedback is deferred without a replacement. |

P2 deliberately retained inline picker presentation after finding one consumer and
no coupling reduction from extraction. Respect that no-op. The embedded icon also
makes byte size a poor proxy for domain complexity. No new source-size, latency,
token-saving or cost-saving estimate is claimed by this roadmap.

The production acceptance inventory in
[production-acceptance.ts](../apps/nemlig-assistant/src/production-acceptance.ts)
at the roadmap baseline listed 24 tools and omitted `check_nemlig_connection`, which the server and smoke
contract include. Slice 0 should reconcile this drift and test inventory agreement
for each supported configuration. Count actual SDK registrations, not grep hits.
The feature-request removal reconciles this inventory: the resulting surface is
24 tools with the picker and 23 without, including connection checking. The
subsequent saved-shopping removal reduces this to 16 and 15 respectively.

The stale `shop_from_my_list` wording is removed with that tool; no separate
metadata fix is needed.

## Product model: five journeys, explicit effect boundaries

| Journey | Preferred experience | Boundary to retain |
| --- | --- | --- |
| Find groceries | Search or browse current Danish catalogue; offer the picker when useful. | Favourites remain explicit; no implicit fallback or extra query fan-out. |
| Plan a shop | Resolve a recipe or list; show covered, clear and unresolved lines. | Planning is read-only; explicit same-run proceed applies only to eligible clear additions. |
| Inspect the basket | Show current items and totals. | No state change or proposal creation is implied. |
| Change the basket | Review exact effects, consent once, then report verified results. | Additions, single-item swaps, removals and clearing keep their distinct authorization rules. Whole-basket replacement, checkout, payment and ordering remain prohibited. |
| Recover the connection | Check connection status and reconnect when needed. | Credentials stay on the secure connection page; feature-request submission has been removed. |

These are product groupings, not a fixed tool-count quota. Keep connection recovery
accessible. Keep accurate read/write and destructive annotations per advertised
tool. The saved-list action vocabulary is removed entirely. Group remaining operations
only when their contracts and host behavior remain understandable. Start by removing duplicate user decisions, then
measure whether fewer descriptors actually help tool selection.

## Ordered delivery slices

Effort labels are relative engineering scope, not calendar commitments. Product
owner reviews journey semantics; implementer owns each isolated slice; verifier
owns evidence. Existing P0/P1 owners retain reconnect, credentials and deployment.

| Order | Slice and effort | Dependency | Checkable exit and stop condition |
| --- | --- | --- | --- |
| 0 | Baseline and acceptance reconciliation — small | None | Record delivered versus live-unproven P2 outcomes and actual `tools/list` with Apps on/off. Establish journey fixtures below. Keep open P0/P1 acceptance visible; no claim that repository CI proves ChatGPT reconnect. |
| 1 | Simplify grocery-run orchestration — medium | 0 | Trace CLI/MCP callers; reuse `resolveShoppingPlan`, calculation and proposal services. Move only shared run composition out of transport. Existing payloads, ordering, authorization and provider-call counts remain identical. Stop if the result is only a forwarding layer. |
| 2 | Remove all saved shopping — owner selected | 0 | Remove eight tools plus list/snapshot application and storage adapters. Preserve same-conversation planning and existing stored bytes. Track delivery in `remove-saved-shopping`; production acceptance remains pending. |
| 3 | MCP v2 and host confirmation proof — bounded spike | 0; independent of 1–2 | Pin an exact released SDK in a disposable branch; prove stdio, HTTP, Apps resources, authentication and confirmation in the supported host matrix. Test accept/decline/cancel/reconnect/unsupported host. Stop and retain current pairs when required host support is absent. |
| 4 | Simplify approved basket interaction — medium/high | 1 and successful 3 | Introduce a capability-aware journey backed by the existing proposal engine. Preserve exact scope, principal/policy binding, expiry, fresh checks inside the lock, fingerprint, single use and final readback. Fake-provider interruption/replay tests prove zero duplicate writes. Preserve current same-run consent without prompting twice. |
| 5 | Retire proven duplicates — medium | 2/4 accepted as applicable | Inventory callers, external hosts, package entrypoints, persisted IDs and picker references; publish a migration mapping and compatibility window. Remove only obsolete registrations/glue with maintained-host acceptance and rollback. Never delete the proposal safety ledger merely because its ID is hidden. |
| 6 | Evaluate Worker-native hosting — bounded spike | Stable application seam; not a prerequisite for 1–5 | Produce compatibility and cost evidence below. Select keep-Container or migrate through a separate reviewed proposal. No production deployment from this roadmap. |

First delivery recommendation: slice 0 plus a proposal for slice 1. SDK migration
must not block application simplification. Worker research may be read-only in
parallel, but runtime rewrites should not compete with reconnect acceptance.

## Confirmation and compatibility gates

The current [MCP v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/)
describes v2 as stable and implements the 2026-07-28 protocol. The
[official input-required guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/input-required.md)
describes re-entry with supplied input and a legacy shim. These establish protocol
capability, not working confirmation in this account's ChatGPT app. Older indexed
SDK README results still describe a beta; resolve exact released package versions
and release notes again when starting the spike.

Test ChatGPT, the supported local stdio client and the existing HTTP client with
recorded versions/capabilities. A shim cannot invent absent host elicitation.
Bind continuation state to authenticated principal, policy revision, exact operation
and reviewed payload; treat echoed state and input as untrusted. Changed prices,
expired consent, disconnects, policy changes and uncertain writes must fail closed.
Keep equivalent single-use state across the intended process/reconnect lifetime,
or invalidate safely and require a fresh review. Do not silently extend expiry.

The UX state sequence is resolve, exact review, authorized consent, fresh
revalidation, one application attempt, verified result. A failed readback reports
uncertainty and never causes a write retry. Existing proposal tests are the starting
point, not code scheduled for wholesale deletion.

## Worker feasibility and cost gate

[Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
includes partial implementations and stubs. A successful bundle is insufficient.
Exercise cookies/redirects, cancellation, streaming transport, SDK resources, auth,
per-principal sessions, encryption, Durable Object storage and serialization with
synthetic fixtures. Preserve the retired shopping namespace without restoring its APIs;
temporary files cannot replace durable session or proposal state.
Feature-request submission is intentionally removed; do not add a GitHub API
replacement or move credentials as part of this spike.

Current cost drivers: Worker requests/CPU, Durable Object operations/storage,
Container awake duration, image storage and bounded logs. Proposed native drivers:
Worker execution/subrequests, durable session/proposal operations, storage, logs
and any remaining service. Count each operation for a normal journey, a maximum
50-line plan, reconnect churn and a replay/timeout storm. Refresh official pricing
at the decision point; no numeric savings claim is justified yet.

Worst credible failure: many isolates multiply upstream calls or repeat a write
because process-local locks/session state were assumed global. Require equivalent
authoritative admission, serialization, breaker, kill switch, bounded read retries,
deadlines and zero uncertain-write retries. Preserve one Container maximum while
it exists; define equivalent bounded admission before removing that architecture.

Compare cold and warm p50/p95, failure recovery, provider-call counts, deployed
artifact size, operating cost envelope and maintenance burden. Stop if equivalent
safety needs more custom machinery or credible costs increase without direction.
The lower-cost engineering default is retaining the existing sleeping Container
and deleting only proven duplicate orchestration. Any live migration needs owner
cost direction, disabled-first rollout and a tested return to the prior artifact
and storage-compatible state.

## Measurement and release acceptance

Use a compact, versioned synthetic journey corpus: direct Danish/English search;
explicit favourites; ambiguous recipe; already-covered basket line; same-run clear
additions; retired saved-tool rejection; changed price; declined
removal; approved single-item swap; disconnect/replay; and unsupported confirmation.
Run writes only against fakes unless separately authorized exact live changes exist.

Record before/after task completion, incorrect tool choices, user questions,
model-visible tool calls, serialized descriptor size, token count with a named
tokenizer, upstream requests and latency. Separate simulated SDK results from
actual ChatGPT evidence. No extra telemetry service or private prompt logging.

Acceptance: all critical safety cases pass; task completion does not regress;
retired saved-shopping calls make zero storage or Nemlig requests; discovery budgets do not
grow; at least one targeted journey loses an unnecessary orchestration step or
implementation loses a demonstrated duplicate. Report code/package deltas without
optimizing for deletion at the expense of contracts. Run focused tests, `pnpm
verify`, strict specs, privacy and package/transport checks appropriate to each
slice. Record exact remote commit and CI; retain live-unproven status until observed.

## Planning checklist

- [x] Retrieve the requested conversation and distinguish recommendations from evidence.
- [x] Rebase the analysis on latest remote main and existing P2 delivery evidence.
- [x] Define journeys, ordered slices, compatibility gates, measurements and cost risks.
- [ ] Complete slice 0 baseline fixtures and obtain slice 1 OpenSpec review before implementation.
- [ ] Complete each delivery slice and its own applicable acceptance; none is marked shipped here.
