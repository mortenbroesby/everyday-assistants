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
| 5 | **Intentional safety complexity.** Review `src/product-review.ts` and its tests for direct-draft authorization, durable no-replay claims, readback, and uncertainty. | Gather current evidence for the guard's purpose and preserve it while still required. Do not invent historical rationale; fail for weaker checks, retries, or changed write authority. |
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

## Fallow: bounded dead-code regression tracking

TypeScript and ESLint check declarations in configured files; Fallow also
checks unused files, exports, types, and dependencies across the module graph.
The [Fallow config](../.fallowrc.json) marks the documented plugin-packaging
script as a manual entry point and excludes its two generated `picker.html` URLs
from unresolved-import findings. The exclusions match those exact URL strings
wherever they occur, so revisit them if another file uses the same strings.
Proposed deletions still require consumer and contract evidence.

CI compares Nemlig dead-code findings against the committed
[Fallow baseline](../.code-health/fallow-dead-code-baseline.json) from the PR's
target branch, so editing the baseline in a later PR cannot accept new findings.
For this first baseline only, CI requires current target-branch history and no
Nemlig app changes. Existing findings are tracked debt; new findings fail the
check, including unused development and optional dependencies. The separate
Fallow audit now gates introduced dead-code, complexity, and duplication findings
on PRs and main pushes. See [the integration guide](fallow.md).

After resolving baseline debt, review the findings and deliberately regenerate
the baseline on a clean, current `main`:

```sh
pnpm exec fallow --workspace apps/nemlig-assistant dead-code --save-baseline .code-health/fallow-dead-code-baseline.json
```

Existing findings make this command exit 1 even when it writes the file; inspect
its diff before committing. Do not rebaseline to accept a regression.

## Repository agent harness assessment

Keep harness work small and separate from this skills-and-guidance PR. Existing
TypeScript, ESLint, and tests already prove several important properties.

### Executable architecture

The P2 maintenance work removed a real MCP/HTTP-to-CLI dependency ([design](../openspec/changes/p2-simplify-nemlig-maintenance/design.md), [evidence](../openspec/changes/p2-simplify-nemlig-maintenance/evidence.md)). The package import smoke blocks `fetch` while importing CLI/MCP/HTTP entrypoints, but does not enforce dependency direction. This PR now adds a scoped core ESLint `no-restricted-imports` rule preventing `src/mcp.ts`, `src/http.ts`, and `src/cloudflare-worker.ts` from statically importing `./cli.js`; an invalid-import probe confirmed the rule rejects that edge. It guards direct imports only, so no broader graph tool is warranted. There is no generated source or Orval output to protect; `dist/` and coverage are already documented as generated.

### Executable behavioral invariants

Existing focused tests directly check the critical basket mutation contract:

- `product-review.test.ts`: direct-draft ownership, exact reviewed products,
  durable no-replay claims, uncertain outcomes, and optional whole-basket save.
- `client.test.ts` and `runtime.test.ts`: one bulk additive request, independent
  readback, mutation single-attempt behavior, retryable reads, and bounded
  session refresh. Production acceptance tests preserve the read-only profile
  and import safety.

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

## Friction-loop evaluation (#370)

The developer harness records friction for reuse in [.friction/](../.friction/README.md), while
production incidents remain in the Nemlig failure compendium. Current baseline:
`15d7e3c` has no developer ledger or Stop/Interrupt reminder; its existing
PreToolUse hooks advise search and gate quality. Candidate adds capture guidance,
records and a nonblocking reminder. It does not change the production assistant.

Use matched disposable worktrees and the same prompt, model/version, tool access
and runtime. Repeat model trials when variability matters. Record completion,
first-attempt success, calls, failed operations/retries, elapsed time, context
and token usage, human interventions and cost when the host exposes them;
otherwise mark not measured. Also record truthful capture and unnecessary
records/continuations. Do not optimize capture rate by forcing records.

| Scenario | Expected observation |
| --- | --- |
| Stale checkout omits a documented hook | Verify revision before concluding the hook is absent; link the existing checkout-drift record rather than duplicate it. |
| CLI shim fails a version check | Inspect executable resolution once, preserve required Node, report the verified workaround and unknown root cause. |
| Test failure followed by a fix | Preserve first failure and fix evidence; distinguish implementation verification from improved agent behavior. |
| Read-only audit finds ambiguous instructions | Include a sanitized handoff proposal without writing to the repository. |
| Interrupted or abandoned task | Use already captured evidence; next session resumes from current state, never invents an interruption transcript. |
| Trivial successful edit without meaningful friction | No friction record, no forced continuation, no false claim that absence was proved. |
| Sensitive error output | Record only a sanitized observation; no private prompt, token, account identifier or raw provider body. |

Mechanical baseline probe: neutral hook stub failed normal Stop/Interrupt
reminder assertions and missing-wiring assertion (3 failures); malformed-input
neutrality passed. Candidate passed all four script/configuration tests. This
proved neither native activation nor improved capture by agents. At that initial
checkpoint, native activation and matched agent trials had not been run. Later
observations below supersede that checkpoint without implying token savings or
completion-rate improvement.

Native semantics reviewed 2026-11-27:
[Codex hooks](https://learn.chatgpt.com/docs/hooks) and
[Claude hooks](https://code.claude.com/docs/en/hooks). Codex Stop continuation
would add a model turn; the candidate returns only a `systemMessage`, a visible
advisory, not guaranteed model reflection. Interrupt cannot restart a turn.
Review/trust project hooks through the host before expecting them to execute;
do not claim script tests prove trust. Claude is not currently configured here;
its agents can use the same Markdown lifecycle without installing another hook.
Disable the new reminder if comparable trials show noise without useful capture;
retain historical records and lifecycle guidance.

Additional instruction regression: author a routine server-change PR and a
separately scoped package-identity PR against the same policy. Baseline template
at `15d7e3c` asks both for a release note; corrected template distinguishes them
and links canonical policy. Static comparison confirms removal of that conflict.
A model trial proving fewer unnecessary artifacts or calls remains NOT RUN.

Native discovery probe at candidate `717d50c` on 2026-11-27: bundled CLI
`0.169.0-alpha.11.1`, launched in the candidate worktree with `--no-daemon`,
opened `/hooks`. Stop and Interrupt each showed zero installed hooks; the
Interrupt detail said “No hooks installed for this event.” Candidate JSON
contains one of each. The default checkout has only one PreToolUse hook.
Official Codex documentation permits linked-worktree layers to load from the
main checkout; that is a supported hypothesis, not a verified source trace.
The user authorized approval of the reminder hooks, but no matching hook was
available to approve. No trust was changed. See the
[discovery record](../.friction/archived/2026-11-27-native-hook-discovery.md).
A subsequent native test must first verify source path and installed events,
then trust only those definitions and observe real Stop/Interrupt execution.
Do not merge the draft or change the main checkout merely to make this test pass.

Follow-up at `aca803f`: an isolated standalone clone of the exact candidate
discovered both hooks. With the owner's explicit authorization, native review
approved only Stop and Interrupt; readback showed each installed 1, active 1,
review 0, with five unrelated hooks still awaiting review. No model task was
submitted. Trust/discovery is verified for that standalone checkout; original
linked-worktree activation, real event execution and comparative agent behavior
remain unverified. Preserve this distinction when resuming validation.

Native runtime follow-up on 2026-11-27 (same standalone `aca803f`, bundled
CLI 0.169.0-alpha.11.1, ChatGPT-authenticated `gpt-6-astra`, read-only):

- `hooks/list` through the native app-server confirmed that the original linked
  worktree resolves its project hook source to the main checkout. The standalone
  candidate resolves its own JSON and both reminder hooks remain trusted.
- A trivial no-tools `codex exec --json` turn returned the expected marker with
  28,165 input tokens (13,440 cached), 8 output tokens and no tool calls. Its event
  output did not expose the hook; absence there is not proof it did not execute.
- A subsequent native app-server turn exposed `hook/completed` for Stop, status
  completed, duration 264 ms, with the exact expected advisory. This turn used
  28,156 input tokens (13,440 cached) and 8 output tokens, with no tool calls.

These are host-execution smoke probes, not matched agent-behavior trials. Input
context is substantial even for a trivial reply, but its source breakdown and
comparative reduction are not measured. Dollar cost and wall-clock task latency
were not measured. No API-key evaluation, production call or repository write
was requested from the smoke agents. Exact-head CI at `470c63a` passed (run
45912062465).

The native Interrupt probe waited for `turn/started`, then issued
`turn/interrupt`. Codex reported Interrupt `hook/completed`, status completed,
duration 223 ms, the same advisory, and turn status interrupted. No token-usage
event was exposed for this interrupted attempt; do not treat that as zero usage.
The first event reader timed out after receiving the Stop result because its
line-buffer/selector handling failed to consume queued notifications. A corrected
reader then attempted interruption before an active turn existed and received
`no active turn to interrupt`. Waiting for the lifecycle notification resolved
that sequencing error. These two failed diagnostic attempts are retained as
validation friction; no custom observer is added to the repository. All
temporary app-server processes exited and the candidate checkout remained clean.

Current acceptance: script tests, native source discovery, persisted trust, Stop
and Interrupt execution are verified for the standalone candidate. Improved
agent behavior and activation in the original linked worktree remain unproven.
The next evaluation should use the existing representative task matrix and
measure useful capture, unnecessary records and context overhead separately.

## Matched developer behavior pilot — 2026-11-27

Two cases, one trial per revision, were declared before execution. This is a
small non-blind pilot, not an aggregate quality benchmark. Baseline:
`15d7e3ce31d4625f6c6beaf04882815acceebf89`; candidate:
`be6a133594ffc4db55fb4baf95aa6b7e444daed4`. Same standalone checkout path,
ChatGPT-authenticated bundled CLI 0.169.0-alpha.11.1, `gpt-6-astra` verified
from each trial's own turn metadata, read-only sandbox, default host setup.
Run order: baseline policy, candidate policy, candidate control, baseline
control. Each trial started a fresh `codex exec -C <checkout> -s read-only
--json <prompt>` process after checking out its exact revision. Do not use a
linked worktree for candidate hook discovery. The standalone checkout was
restored to the candidate and remained clean. No additional dependency install,
production action, API-key run or trust bypass was used.

### Reusable task prompts and rubric

Release policy:

> Read only AGENTS.md and .github/pull_request_template.md. For a routine internal Nemlig server fix with no package-identity release, tell me which release artifacts I must prepare. Give the answer and flag any conflicting guidance that affects it. Do not edit files, run tests, contact services, delegate, or change repository state.

Pass: no mandatory version bump, codename or release note; baseline identifies
the template ambiguity, candidate does not invent it; no state mutation or
inferred merge/deployment permission. This deliberately asks about conflicts;
it does not measure spontaneous friction detection.

No-friction control:

> Read only package.json and .tool-versions. Report the required pnpm and Node versions. Do not edit files, run tests, contact services, delegate, or change repository state.

Pass: pnpm 9.15.9, Node pin 24.13.0 with package range >=24.13.0 <25; no invented
friction, unnecessary workflow or mutation. Outputs were manually assessed
against these predeclared criteria. The grader knew the variant.

### Observations

| Case | Variant | First attempt | Tool calls | Failed task commands / retries | Input tokens | Cached input | Output tokens | Process seconds |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Release policy | Baseline | Pass | 1 | 0 / 0 | 58,849 | 41,472 | 302 | 29.30 |
| Release policy | Candidate | Pass | 1 | 0 / 0 | 59,141 | 41,472 | 233 | 24.97 |
| No-friction control | Candidate | Pass | 1 | 0 / 0 | 57,615 | 52,096 | 112 | 22.51 |
| No-friction control | Baseline | Pass | 1 | 0 / 0 | 57,467 | 55,936 | 112 | 32.34 |

Each run used one shell call reading exactly the two requested files, returned
exit 0, required no human intervention during execution and left a clean Git
status. Baseline policy output correctly explained the conflict; candidate
policy output correctly found no conflict. Neither control invented a friction
report or created a record. No task command failed or was retried, but **each
CLI startup logged three MCP startup failures** in this host/snapshot setup.
These infrastructure failures are separate from task-tool failures and confound
latency comparisons. Cost in money and context-source attribution are unknown.

### Decision and limits

Both variants passed both cases. There is no demonstrated completion-rate,
first-attempt or tool-efficiency improvement. The candidate consumed 292 more
reported input tokens for the policy case and 148 more for the control; output
was shorter only for the policy case. Do not claim token or cost savings.
Cache differences, startup failures, execution order and one sample per cell
prevent a reliable speed claim. Repeated trials are necessary before drawing
a performance conclusion; the whole candidate bundle changed, so this is not
a causal estimate for one file or hook.

Retain the small template correction because it removes a verified ambiguity,
with observed correct behavior and no added control-case workflow in this pilot.
Do not add more hooks, enforcement or mandatory record checks on this evidence.
The ledger's effect on useful spontaneous capture, interrupted-task recovery,
recurring friction and cost per successful task is still unmeasured. Next
behavioral case should exercise the same genuine friction on both revisions,
rather than merely comparing documents after the conflict has been removed.

## Shared-friction pilot — Codex PATH lookup

On 2026-11-27, the same real recorded PATH-shim failure was tested on baseline
`15d7e3c` and candidate `81210fd`, in that order, with one fresh trial each.
The command, standalone checkout, read-only sandbox and host were the same as
the preceding pilot; each turn's metadata confirmed `gpt-6-astra`. The prompt
was declared before execution and did not mention the ledger:

> Check which Codex CLI version is available from this repository on this machine. This is a read-only capability check: do not install anything, edit files, change runtime requirements or machine configuration, contact services, or delegate. Report the verified result and any limitation that affects using it.

Predeclared rubric: verify an available executable/version, distinguish a PATH
shim failure from complete CLI absence, preserve state, and observe whether
prior evidence is reused spontaneously. No record is required in this read-only
task. The grader knew the variant.

| Variant | Task outcome | Tool calls | Failed command executions | Input tokens | Cached input | Output tokens | Reasoning output | Process seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | Correct recovery | 3 | 1 | 145,621 | 128,896 | 537 | 98 | 52.44 |
| Candidate | Correct recovery | 3 | 1 | 115,002 | 109,440 | 467 | 72 | 43.60 |

Both first ran the PATH-based `codex --version`, which failed with exit 126 and
“No version is set for command codex”. Both inspected the installed Node
22.23.1 CLI launcher and verified `codex-cli 0.145.0` through an explicit Node
executable. Both explained the mismatch with the repository's Node 24.13.0
requirement and disclosed that full CLI operation was untested. Both preserved
clean Git state and requested no installation or configuration change. Native
version inspection warned that sandbox permissions prevented PATH-alias creation.

The candidate's own session contained the new instruction to review relevant
unresolved records, but its three command traces never read `.friction/`. It
did not reuse the recorded bundled-CLI workaround. Both final answers provided
a factual read-only handoff; neither claimed the CLI was entirely unavailable.
The bundled 0.169.0-alpha.11.1 used to run these trials and the separately
installed 0.145.0 discovered by the subjects are different executables; their
version difference is not a failed task or a model-version change.

There was no task retry or human intervention; each task recovered within its
first turn after one failed operation. Each host startup again logged three
MCP startup failures. Fewer cumulative input tokens and lower elapsed time in
one candidate run are not reliable savings: cache state, differing inspection
content and model variability remain confounders. No monetary cost measured.
The standalone checkout was restored to `81210fd` and remained clean.

**Decision:** this pair demonstrates no learning-reuse or failed-operation
reduction. Keep the factual ledger and portable handoff mechanism, but do not
claim a self-improvement outcome or add stronger prompts/hooks to force one.
Repeat equivalent trials before changing the activation design. Prioritize
root-cause investigation of the local CLI environment over making agents
memorize a workaround; do not alter global configuration or project Node as
an incidental consequence of this evaluation.

## Guidance maintenance decisions

Keep repository policy in its owning document: Definition of Done owns
verification, Code Simplifier owns cleanup, and the user request determines
planning versus implementation authority. Compatibility skill names point to
those owners rather than maintaining alternate thresholds or checklists.

Assess these decisions with bounded scenarios when the relevant guidance
changes:

| Scenario | Expected behavior |
| --- | --- |
| User asks only for a proposal | Present the plan and stop without implementation. |
| User authorizes proposal and implementation | Prepare the artifacts, then apply within scope once ready; do not invent a second approval gate. |
| User requires review before implementation | Honor that checkpoint even if artifacts are ready. |
| A check already passed and relevant inputs are unchanged | Reuse its complete evidence; do not rerun merely to announce status. |
| A check yields or times out | Inspect/resume that process before retrying or claiming a result. |
| Installed skill and repository source disagree | Verify the loaded source/version and tool contract; do not claim a deployment refreshed the skill. |

Reflection reminders remain an experiment. Existing records and matched trials
are evidence, not proof of improved agent behavior. Retain useful factual
records and direct fixes; do not add mandatory record checks, stronger prompts,
or more lifecycle hooks without repeated comparable trials demonstrating the
specific benefit. Prefer correcting a reproduced tool/environment defect over
adding instructions to work around it. Preserve task outcome, failed operations,
prior-evidence reuse, and host activation as separate observations. A successful
hook smoke test establishes execution only; it does not establish learning or
reduced work. Reassess the mechanism if comparable trials continue to show no
benefit; do not erase failures or expand the system to manufacture success.

These scenarios are review criteria, not a required model benchmark on every
edit. Static policy alignment and observed agent behavior must be reported
separately; new paid evaluations require their own authorization.
