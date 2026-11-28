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

From the repository root, pass the observation and known details when creating a
record. For example:

```sh
pnpm friction new lint-timeout --title "Lint timed out" --scope "developer harness" --category validation --severity medium --observation "Lint exited after 30 seconds." --impact "One rerun."
pnpm friction update lint-timeout --impact "Two reruns." --hypothesis "Unknown."
pnpm friction rename lint-timeout pre-push-lint-timeout
pnpm friction update pre-push-lint-timeout "The next run completed in 12 seconds."
pnpm friction archive pre-push-lint-timeout
pnpm friction reopen pre-push-lint-timeout
```

The slug is the short identifier in the filename. `rename` changes that identifier
and preserves the date, title, folder and contents. Use `pnpm friction update <slug> --title "New heading"` to change the heading. If two dates share a
slug, use the full dated filename.

`new` and `update` accept `--title`, `--scope`, `--task`, `--paths`, `--category`,
`--severity`, `--observation`, `--impact`, `--hypothesis`, `--improvement` and
`--resolution`. New records use the local date and current Git revision.
Named fields replace their existing contents. A quoted update appends a dated
note, preserving earlier observations. Write “unknown” or “not measured” for
details you cannot establish. Running `new` with only a slug still creates an
editable [template](templates/record.md).

Records start in [active/](active/). After recording the resolution evidence or
acceptance decision, use `archive` to move the record to [archived/](archived/).
Use `reopen` for recurrence. Update links when moving or renaming a linked record.

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
