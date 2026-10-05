---
name: jcodemunch-routing
description: Conditional JCodeMunch routing for repository intelligence when local context and targeted search do not provide enough confidence.
---

# Route repository intelligence deliberately

JCodeMunch is optional repository intelligence, not a prerequisite for code
work. Use the cheapest reliable source of context. Escalate only when a
structured answer materially reduces uncertainty, exploration cost, or change
risk. Choosing not to invoke it is normal.

## Decide whether to invoke it

Use the available context, a direct file read, or a small targeted native
search when that already establishes the needed fact. Do **not** invoke
JCodeMunch for a typo, formatting or copy change, obvious one-file edit,
straightforward local test fix, understood local refactor, or a small React
component whose complete context is already open.

Invoke JCodeMunch when it is clearly cheaper or safer to answer a repository
question, including:

- locating or understanding unfamiliar functionality or ownership;
- a shared/public symbol, cross-package contract, or dependency-boundary
  change;
- callers, references, importers, implementations, or call relationships;
- change/PR blast radius or apparently unused-code deletion;
- strange defensive code whose purpose remains unclear; or
- targeted native searches that have not established callers or ownership.

Use this as a heuristic, not a fixed ladder. It is fine to jump directly to
JCodeMunch when the relationship question is already clear, and to use Git,
PR, or OpenSpec history only when repository evidence still leaves intent
unclear.

## Retrieve the minimum useful evidence

Start with the smallest tool that answers the question:

| Question | Prefer |
| --- | --- |
| Where is this defined? | symbol search, then its source |
| Who imports or references it? | importers or references |
| What calls or implements it? | call hierarchy or implementations |
| What could this change affect? | blast radius or changed-symbol analysis |
| Is deletion safe? | deletion-safety analysis |
| What is the relevant repository shape? | a bounded outline or dependency graph |

Follow `symbol → relationship/reference → relevant implementation`; do not
start with broad search, a repository dump, or complete-file reads. Do not
retrieve facts already in the active context. JCodeMunch can help with indexed
configuration, documentation, ownership, and change evidence as well as code,
but a short known non-code file is still cheaper to read directly.

Prefer compiler/SCIP-backed findings when the tool says that such evidence is
available and fresh. Treat non-SCIP results as useful structured evidence, not
proof. If the selected repository or index is stale, missing, or the MCP tools
are unavailable, say so and use the smallest reliable local fallback; do not
make reindexing or SCIP setup a routine task requirement.

## Dynamic behavior and boundaries

In the current Codex setup, this skill is the native conditional routing point:
an agent selects it only after an actual repository-intelligence signal. There
is no Codex lifecycle hook here that can inspect an agent's future read and
conditionally replace it with an MCP call. Do not add commit hooks, edit hooks,
wrappers, classifiers, or background indexing to simulate one—those would tax
ordinary work and run too late to guide exploration. JCodeMunch's installed
automatic hooks are for Claude Code, not Codex.

JCodeMunch complements the applicable implementation/refactoring skill and
verification; it does not replace either. It never authorizes edits, external
actions, or a claim that a test passed.

## Routing checks

Before reporting that this guidance applied correctly, check the decision
against representative cases:

| Scenario | Expected route |
| --- | --- |
| Typo in one known file | No JCodeMunch |
| Obvious local function cleanup | Normally no JCodeMunch |
| Small React component with complete local context | No JCodeMunch solely because it is React |
| Shared TypeScript contract change | JCodeMunch relationships/references |
| Apparently obsolete adapter deletion | JCodeMunch deletion-safety analysis |
| Unfamiliar subsystem refactor | JCodeMunch, then the relevant refactoring skill |
| Several targeted searches do not establish callers or ownership | Escalate to JCodeMunch |
| Strange defensive code | JCodeMunch first; history only if intent remains unclear |

For a consequential decision, record the focused query, the relationship it
established, and any freshness limitation. That is enough to assess usefulness
without building benchmark infrastructure or measuring every routine change.
