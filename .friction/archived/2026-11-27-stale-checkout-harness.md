# Default checkout omitted current harness integration
- Date: 2026-11-27
- Scope: developer harness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 31c81e6 (inspected checkout), 15d7e3c (current baseline)
- Paths: .codex/hooks.json, .codex/config.toml, AGENTS.md
- Category: discovery
- Severity: medium

## Observation and evidence
The default checkout was at `31c81e6`. Its hooks contained only the JCodeMunch
advisory; `.codex/config.toml` and `docs/fallow.md` were absent. A fetch and new
isolated worktree at `15d7e3c` exposed the Fallow integration from merged #368.
This was checkout drift, not evidence that the current repository lacked gates.

## Impact
One initial audit batch examined stale guidance before current-state verification.
No code was changed from those observations. Elapsed time and tokens not measured.

## Hypothesis
The long-lived default checkout had not advanced with remote main. The revision
difference is established; why it was left behind is unknown.

## Improvement and validation
Reuse existing repository preflight: establish branch/revision/current remote
before interpreting instruction absence. No additional mandatory hook is needed.
Check relevant files on the selected baseline and preserve unrelated worktrees.

## Resolution
Audit continued in the isolated `codex/agent-friction-loop` branch at `15d7e3c`.
The original checkout was preserved. This resolves this occurrence only; future
recurrence should be linked here rather than described as a missing feature.
