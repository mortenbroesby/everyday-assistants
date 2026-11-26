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

```markdown
# Short factual title
- Date: YYYY-MM-DD
- Scope: developer harness / named app
- Task: issue or PR link
- Revision: full or unambiguous commit SHA
- Paths: relevant repository paths; no private local paths
- Category: one category
- Severity: low | medium | high
- Status: open | investigating | resolved | accepted

## Observation and evidence
What happened, expected versus actual; sanitized commands/errors or public links.

## Impact
Observed counts, time or cost with method; otherwise not measured.

## Hypothesis
Suspected cause and confidence, clearly distinct from established facts.

## Improvement and validation
Smallest candidate fix and the test or comparable task that would demonstrate value.

## Resolution
Fix/PR links, revision, validation, remaining uncertainty and recurrence history.
```

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

Completion and interruption reminders are advisory. They must not write records,
inspect transcripts, block stopping, force another model turn, or infer success.
An abandoned process may never invoke a hook: the next session reviews its
handoff and repository state. Native hook activation requires host trust and
must be verified separately from script tests.

## Native reminder and activation

The repository's Codex Stop/Interrupt command emits a short `systemMessage`.
It is a visible reminder, not a model continuation or proof of reflection.
Review and trust the changed project hooks in the host's `/hooks` interface
before expecting native execution. Do not bypass that trust decision. Tests
exercise script inputs and configuration only; native activation is unverified
until a real trusted turn and interruption are observed. Other agents use the
portable lifecycle and handoff guidance. See the friction scenarios in the
existing developer evaluation document before adding another host integration.
