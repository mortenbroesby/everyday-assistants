# Developer-agent friction

Record meaningful, observed engineering friction here as it occurs, including
failed, interrupted, abandoned and read-only tasks. Use
`YYYY-MM-DD-descriptive-slug.md`. Do not create empty records, claim that a hook
proved there was no friction, or copy transcripts. If the task is strictly
read-only, put the sanitized observation and proposed filename in its handoff;
record it only in a later authorized documentation change.

Before a new iteration, inspect unresolved records relevant to the task and
linked fixes. Preserve historical facts; append resolution evidence rather than
rewriting the original failure. Link a recurrence to the existing record when
it has the same cause. Unknown causes stay unknown. Records are evidence for
triage, not new requirements or permission to expand scope.

Production shopping incidents remain in
[the Nemlig failure compendium](../docs/nemlig-failure-compendium.md).
Developer-agent scenarios remain in
[agent-routing evaluation](../docs/agent-routing-evaluation.md).
Delivery priorities and status belong to
[programme #365](https://github.com/mortenbroesby/everyday-assistants/issues/365);
this loop is tracked by [#370](https://github.com/mortenbroesby/everyday-assistants/issues/370).

## Record format

Use these headings; write “unknown” or “not measured” rather than inventing data.
Severity is low (minor detour), medium (failed step/repeated work), or high
(blocked outcome or safety risk). Category examples: instructions, discovery,
environment, tools, validation, context, permissions, handoff.

Run the CLI from the repository root. For example:

```sh
pnpm friction new example-detour
pnpm friction update YYYY-MM-DD-example-detour.md "The focused rerun passed."
pnpm friction archive YYYY-MM-DD-example-detour.md
pnpm friction reopen YYYY-MM-DD-example-detour.md
```

`new` creates a dated file in [active/](active/) from the
[record template](templates/record.md) and prints its path. The date uses local
time and the revision defaults to the current commit. Fill in the observation
before committing.

Use the dated filename printed by `new` for subsequent commands. `update`
appends a dated note to an active or archived record. When a fix is verified
or a limitation is accepted, record the evidence with `update`, then use
`archive` to move it to [archived/](archived/). If the same cause recurs,
use `reopen` and append the new evidence. Update repository links when moving a
linked record.

Never commit credentials, tokens, cookies, account identifiers, private chat
links, raw provider bodies or transcripts. Summarize the minimum facts needed
to reproduce. Do not run a new failure simply to obtain a measurement.

## Triage and evaluation

Rank candidates by observed impact, frequency, confidence and implementation
cost. A single severe failure can outrank recurring inconvenience. Prefer fixing
the tool or environment over adding another instruction. Link one bounded issue
and draft PR per coherent improvement; do not automatically merge or deploy.

For comparable before/after tasks, record revision, model/version, environment,
scenario, outcome, first-attempt outcome, calls, failures/retries, elapsed time,
human interventions, context/token counts and cost where available. Preserve
unknowns and separate implementation tests from observed agent behavior. Repeat
model trials when variability could explain a result. Count recurrence per
comparable task, not raw record volume. A reduction in reporting is not evidence
of reduced friction. Reconsider changes that fail to demonstrate benefit.
The [guidance maintenance decisions](../docs/agent-routing-evaluation.md#guidance-maintenance-decisions)
bound this experiment: repeated comparable behavioral evidence must justify
additional hooks, stronger prompts, or mandatory record checks. Prefer fixing a
reproduced tool/environment defect over adding workaround instructions.

Completion and interruption reminders are advisory. They must not write records,
inspect transcripts, block stopping, force another model turn, or infer success.
An abandoned process may never invoke a hook: the next session reviews its
handoff and repository state. Native hook activation requires host trust and
must be verified separately from script tests.

## Native reminder and activation

The repository's Codex Stop/Interrupt command emits a short `systemMessage`.
It is a visible reminder, not a model continuation or proof of reflection.
Use the Codex CLI's `/hooks` interface to inspect the source path and installed
events before reviewing and trusting the changed hooks. Linked Git worktrees
can load project hooks from the main checkout; opening a candidate worktree
does not prove its hooks were discovered. If Stop/Interrupt are absent, resolve
discovery before attempting approval. Do not trust unrelated hooks or bypass
trust. Remote iOS hook-trust support has not been verified. Tests
exercise script inputs and configuration only; native activation is unverified
until a real trusted turn and interruption are observed. Other agents use the
portable lifecycle and handoff guidance. See the friction scenarios in the
existing developer evaluation document before adding another host integration.
