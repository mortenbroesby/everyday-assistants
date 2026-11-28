# Configured CLI model unavailable to the evaluation account

- Date: 2026-11-28
- Scope: Nemlig developer harness
- Task: [Agent evaluations](https://github.com/mortenbroesby/everyday-assistants/issues/365)
- Revision: ee90c72 with local conversation changes
- Paths: apps/nemlig-assistant/scripts/local-conversation.mjs
- Category: environment
- Severity: medium
- Status: resolved

## Observation and evidence

The native host admitted the isolated fixture, but the first model turn failed with the configured model. The account's native model catalog supplied a different default.

## Impact

The initial trial ended before the routing journey could run. Elapsed cost was not measured.

## Hypothesis

Host configuration can reference a model outside the current account catalog.

## Improvement and validation

Read the account's advertised default model at startup and record the selected model. Allow an explicit selection for repeatable comparisons.

## Resolution

The next trial reached the fixture and executed a grocery search using the catalog default. That establishes model availability separately from draft creation and widget acceptance.
