# PR template requested obsolete routine release notes
- Date: 2026-11-27
- Scope: developer harness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 15d7e3c baseline; candidate 0da7088 before correction
- Paths: .github/pull_request_template.md, AGENTS.md
- Category: instructions
- Severity: low

## Observation and evidence
The PR template asked every release-bearing Nemlig change to paste a summary
from `release/notes/<version>.md`. Current root Delivery and release guidance
explicitly says routine server deployments need no semantic-version bump,
codename or release-note file; only separately scoped package-identity releases
need a reviewed note. Both instructions were present at the baseline revision.

## Impact
One contradictory instruction found. No unnecessary release file was created
in this programme. Agent delay, tokens and recurrence were not measured.

## Hypothesis
The PR template likely retained an older release policy after the root guidance
changed. The contradiction is factual; its history was not investigated.

## Improvement and validation
Replace the obsolete template demand with a link to canonical Delivery and
release policy and its package-identity exception. Compare the two documents
and verify that routine PR authoring no longer directs a release-note creation.
A later matched agent task can test whether this avoids an unnecessary artifact.

## Resolution
Corrected in draft PR #371. Manual one-to-one policy comparison passes; actual
agent behavior improvement is unmeasured. No release policy, runtime, version
or production setting was changed.

### Matched pilot follow-up
The 2026-11-27 developer pilot compared baseline `15d7e3c` and candidate
`be6a133` with the same read-only policy prompt and gpt-6-astra. Both answered
correctly in one tool call and made no edits. Baseline explicitly identified
the ambiguity; candidate correctly found no conflict. A no-friction version
lookup control passed on both, without invented records. Candidate input
usage was higher by 292 tokens on policy and 148 on control. This supports
removing the ambiguous instruction, not a success-rate, speed or cost claim.
See docs/agent-routing-evaluation.md for prompts, all four outcomes and limits.
