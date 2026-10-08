# Agent refactoring setup evaluation

This document describes a small repeatable eval for the repository-local
refactoring setup. It measures decisions and outcomes, not just instruction
size or whether routes exist.

## Historical routing measurements

The byte counts and compact-skill routes in the issue #64 comparison below
record the 2026 issue #64 snapshot; they are not measurements or routes for PR
#181. PR #181 restored the full skills. Keep that history as context only.
Current routes are in [AGENTS.md](../AGENTS.md). This document does not add
instructions to ordinary task context.

At issue #64's implementation baseline, root `AGENTS.md` was 6,078 bytes and
the two lifecycle files were 5,351 bytes. The later compact route inventory was
15,810 bytes across root guidance, lifecycle gates, the Nemlig router, and
compact selected skills. These figures describe that earlier snapshot, not the
current skill set or runtime discovery. Static byte counts cannot establish
that agents follow instructions or complete code changes better.

## Refactoring eval cases

Use these eight cases when materially changing `AGENTS.md`, cleanup skill
versions, routing descriptions, prompts, or models. Run the same task prompt on
baseline and candidate in disposable worktrees, changing one variable at a
time: hold model, prompt, and repository revision fixed for setup changes; hold
the setup fixed for model changes. Record the repository SHA, model,
`skills-lock.json` revisions, skill files actually read, patch, checks, and
outcome. Do not apply eval changes to the working branch.

| # | Scenario and fixture | Expected result / failure signal |
| ---: | --- | --- |
| 1 | **Reuse an installed dependency.** Revisit the historical release argument parser in `release/agent.ts` at the P2 pre-adoption baseline (`152e997`); Commander was already installed. | Identify and reuse Commander while preserving parsing and error behavior. Fail for a new parser/dependency or a migration without characterization. |
| 2 | **Calculation beside I/O.** Use the P2 plan-calculation/effect-boundary investigation in `openspec/changes/p2-simplify-nemlig-maintenance/evidence.md`. | Characterize ordering, bounds, and outputs; split only if a real dependency/effect is removed or meaningful no-I/O testing results. A justified no-op passes. |
| 3 | **One-implementation abstraction.** Ask whether to add a service/factory/interface around one existing MCP operation in `src/mcp.ts`. | Prefer direct code unless a demonstrated consumer, effect boundary, or testing problem benefits. Fail for speculative DI, wrappers, registries, or generic helpers. |
| 4 | **Apparently unused export.** Inspect a candidate export and its import graph, package `bin` entries, tsdown entries, Wrangler bindings, scripts, and compatibility callers before proposing deletion. | State evidence and any unresolved dynamic/public consumers; preserve until deletion is proven safe. Fail for grep-only deletion or treating an internal search as proof of no external consumer. |
| 5 | **Intentional safety complexity.** Review `src/proposals.ts` and its tests for authorization, expiry, replay, fresh validation, and mutation behavior. | Gather current evidence for the guard's purpose and preserve it while still required. Do not invent historical rationale; fail for weaker checks, retries, or changed write authority. |
| 6 | **React composition problem.** Use a small TSX fixture with one component combining several independent boolean modes, callbacks, and sibling-owned state. | Route to Composition Patterns for the observed API/state problem; preserve behavior and use only rules compatible with the fixture's React version. Fail for a provider/context rewrite without a concrete boundary. |
| 7 | **Measured React performance issue.** Use a fixture plus Profiler evidence of an expensive list rerendering after unrelated parent state changes. | Route to React Best Practices for the measured rendering/data-flow concern; make the smallest evidence-based change. Fail for memoization or framework migration without evidence. |
| 8 | **Negative control.** Make a trivial, one-line correction with no maintenance problem or architectural change. | Do not activate cleanup/archaeology, deletion-audit, or counterfactual-review workflows; do not expand scope or add tests without a behavior risk. Use Verification Before Completion only if making a completion claim. |
| 9 | **Temporary compatibility path with an old removal date.** Review its current consumers and the evidence cited by the original decision. | Treat the date as a review trigger only. Require the observable removal condition and current compatibility evidence; fail for deletion based only on age or a closed issue. |
| 10 | **Explicit read-only deletion audit.** Ask what maintenance can be removed from one named subsystem with an apparently obsolete fallback. | Return no more than five ranked candidates, evidence, uncertainty/contracts, and the smallest next proof step. Make no edits or deletions; fail for repository-wide inventory, static-reference-only proof, or confident claims without evidence. |
| 11 | **Substantial refactor moving responsibilities across files.** Compare before/after concepts and maintenance obligations. | Report what was removed, added, retained, and why the result is easier to understand, verify, or change. Fail if file movement alone is called simplification or important retained complexity is hidden. |
| 12 | **Conditional counterfactual review.** Review a significant deletion with the original task, source, diff, contracts, and checks. | Identify concrete evidence-backed objections or clearly state that no material objection is supported. Fail for manufactured stylistic criticism, speculative requirements, or mechanically applied suggestions. |

Fixed inputs for the React cases:

```tsx
function ProductSurface({
  showSearch, showFilters, showSelected, compact, busy,
  query, setQuery, filters, setFilters, selected, onSelect,
}) {
  return <section className={compact ? "compact" : "wide"}>
    {showSearch && <Search value={query} onChange={setQuery} />}
    {showFilters && <Filters value={filters} onChange={setFilters} />}
    {showSelected && <SelectedItems value={selected} onSelect={onSelect} />}
    {busy && <Spinner />}
  </section>;
}
```

For case 6, include two callers that need different combinations and own
different query/filter state; the task is to improve the component API and state
ownership without changing visible behavior. For case 7, use a `ProductList`
that renders 800 expensive rows from stable `products` and `selectedIds` props;
attach a Profiler observation that toggling an unrelated help panel rerenders
all rows and commits in 40 ms. Require a before/after measurement and preserve
selection behavior. Keep these fixtures outside app source and dependencies.

For each case, check these outcomes: behavior and safety preserved; correct
skill routing; reuse/deletion considered before invention; no unrelated scope or
unnecessary architecture; verification matches the changed surface and follows
the last relevant edit; complexity decreased or a reasoned no-op was chosen.
Record a short pass/fail rationale for each outcome and the specific failure
signals above. Compare outcome patterns and human interventions across baseline
and candidate; eight cases are too few for a reliable aggregate quality score.
Use static assertions for route paths, unique skill names, required local
references, and package/framework facts; human review remains necessary for
behavior preservation and actual complexity reduction. No harness or CI job is
proposed.

## Operational reliability cases

Use these five cases when changing task-continuity, verification, delegation,
capability-preflight, or GitHub authoring guidance. Run baseline and candidate
with the same task, repository revision, and model. These are judgment-based
checks; record the observed behavior and any human intervention, not a combined
score.

| Scenario | Expected result / failure signal |
| --- | --- |
| **Root-cause continuity.** Continue an interrupted investigation after two fixes fail to distinguish the cause. | Carry forward the objective, current hypothesis/evidence, completed work, and unresolved question; revise the hypothesis before another speculative fix. Fail for restarting exploration or losing the task contract. |
| **Verification still running.** A verification command yields or times out while its process/session remains active. | Inspect or resume the same process and reuse its result; start a replacement only after confirming it stopped. Fail for duplicate full verification or treating timeout as failure/pass. |
| **Delegation handoff.** A reviewer or implementer is still active when the parent is asked to continue. | Preserve task identity, scope, exclusions, owner, and evidence; integrate the current work before reassigning. Fail for duplicate work, repeated polling without new evidence, or trusting a report without reviewing its diff. |
| **Missing capability.** A task depends on one unavailable service, credential, runtime, or artifact. | Test only the required capability early, use a safe read-only fallback where useful, and state the precise blocker. Fail for bootstrapping unrelated services or seeking unrelated credentials. |
| **Shell-sensitive PR text.** Create a PR description containing backticks, `$()`, quotes, and newlines. | Preserve the literal text using structured input or a body file, then read it back to check formatting. Fail if shell interpolation runs or the submitted body differs. |

## Knip: bounded unused-code regression tracking

TypeScript's `noUnusedLocals` and `noUnusedParameters`, plus ESLint, check
declarations in configured files. They do not identify every unreachable file,
unused export, or dependency. Knip can analyze those through an entry-to-module
graph. The scoped configuration models the three tsdown entries, four package
`bin` aliases, Worker entry, scripts, tests, and UI tooling. An incomplete graph
can report live exports or dependencies as unused, so configuration hints and
every proposed deletion still require runtime, package, and host-consumer proof.

`pnpm code-health` compares the current Knip result with the committed,
main-SHA baseline. It distinguishes stable identities, rather than counts, so a
same-count replacement is a regression. Existing findings are honest baseline
debt; new findings fail CI, while resolved findings are reported. The command
cannot modify source, fix findings, or refresh the baseline. Only the explicit
reviewed `pnpm code-health:baseline` command writes the baseline.

Agents should inspect a relevant result, avoid unrelated baseline cleanup, and
prove any deletion independently. Do not add broad ignores merely to quiet the
scanner or regenerate the baseline to clear a regression. This is a local,
read-only CI check: it does not create GitHub reports or receive write
permissions.

[entry discovery]: https://knip.dev/explanations/entry-files
[configuration]: https://knip.dev/reference/configuration
[false-positive guidance]: https://knip.dev/guides/handling-issues

## Repository agent harness assessment

Keep harness work small and separate from this skills-and-guidance PR. Existing
TypeScript, ESLint, and tests already prove several important properties.

### Executable architecture

The P2 maintenance work removed a real MCP/HTTP-to-CLI dependency ([design](../openspec/changes/p2-simplify-nemlig-maintenance/design.md), [evidence](../openspec/changes/p2-simplify-nemlig-maintenance/evidence.md)). The package import smoke blocks `fetch` while importing CLI/MCP/HTTP entrypoints, but does not enforce dependency direction. This PR now adds a scoped core ESLint `no-restricted-imports` rule preventing `src/mcp.ts`, `src/http.ts`, and `src/cloudflare-worker.ts` from statically importing `./cli.js`; an invalid-import probe confirmed the rule rejects that edge. It guards direct imports only, so no broader graph tool is warranted. There is no generated source or Orval output to protect; `dist/` and coverage are already documented as generated.

### Executable behavioral invariants

Existing focused tests directly check the critical basket mutation contract:

- `proposals.test.ts`: exact-review authorization, connection and expiry, basket
  drift, fresh product checks, zero writes on rejection, single use, and no
  replay after uncertainty; its HTTP fixture checks sequential/partial writes.
- `client.test.ts` and `runtime.test.ts`: mutation single-attempt behavior,
  retryable reads, and bounded session refresh. `product-review.test.ts` checks
  revision/submission invalidation. Production acceptance tests preserve the
  read-only profile and import safety.

These tests assert effects and request counts, so they are stronger than prose
for preserving the encoded invariants. They cannot prove a human approved the
exact review; that interaction boundary must not be claimed from unit tests.

### Code archaeology and mutation testing

A separate `code-archaeology` skill is still not justified. Code Simplifier
contains the conditional evidence workflow for significant changes with unclear
intent and an explicitly invoked, read-only deletion-audit mode. Ordinary
cleanup bypasses both; review guidance is conditional on material deletion,
restructuring, or uncertain safety.

A one-time mutation experiment ran in disposable copies without installing
tools. The focused proposal/client baseline passed 67/67; all four mutants were
killed: weakening the authorization-kind guard, bypassing basket fingerprints,
using cached instead of fresh apply-time product data, and enabling provider
write retries. The lost-response HTTP fixture caught the retry mutant; the 503
assertion alone did not. The experiment exposed that the basket-drift test's
zero-write assertion was skipped when its error assertion failed, so the test
now checks write count before matching the error. Re-running that mutant fails
specifically at `mutations === 0` (actual 1). Keep this as evidence, not a
permanent Stryker, CI, or mutation-suite dependency.

### What this lets Codex stop remembering

Tests can enforce authorization, stale-state rejection, fresh apply-time
validation, single-use proposals, no uncertain-write replay, bounded read
retries, and import-time side-effect safety. A narrow CLI-import rule could
enforce the remaining demonstrated dependency direction. Reject a general
dependency graph, generated-code guard, mandatory archaeology, or permanent
mutation platform; none has enough repository-specific signal to justify its
maintenance.
