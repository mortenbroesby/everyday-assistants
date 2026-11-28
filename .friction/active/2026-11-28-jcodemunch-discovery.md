# Indexed retrieval was rarely exercised

## Observation and evidence

A local sample of 70 Codex sessions associated with this repository from
November 22–28 contained two direct JCodeMunch calls, both index lookups.
On November 28 the default checkout resolved to a September 13 index.

## Impact

The agent needed an index refresh before using it for current code discovery.
Token cost across the sampled sessions was not measured.

## Context

- Date: 2026-11-28
- Scope: developer harness
- Task: index-first JCodeMunch routing
- Revision: a39ef90
- Category: discovery
- Severity: low

## Hypothesis

The former fallback-oriented routing may have discouraged early use.

## Improvement and validation

Route nontrivial exploration through a bounded query first. The refreshed
checkout returned the advisory hook's searchCommand as the first result of
a 450-token ranked-context query.

## Resolution

Future task samples are needed to establish adoption and token impact.
