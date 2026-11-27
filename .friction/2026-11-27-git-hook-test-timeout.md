# Existing pre-push test exceeded its subprocess deadline
- Date: 2026-11-27
- Scope: developer harness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 15d7e3c with friction-loop working changes
- Paths: scripts/git-hooks.test.mjs, .husky/pre-push
- Category: validation
- Severity: medium
- Status: investigating

## Observation and evidence
`node --test scripts/friction-hook.test.mjs scripts/git-hooks.test.mjs`
reported 13 passes and one failure. The existing case “pre-push gates before
fast verify and propagates exit 0” failed with `spawnSync /bin/sh ETIMEDOUT`
after 5010.6 ms. The existing harness sets a 5000 ms subprocess timeout.
The four new friction-hook tests passed. Fallow ran concurrently in a separate
process; this establishes overlap, not causation.

## Impact
One failed validation case and one focused rerun. No production behavior or
hook implementation was changed to conceal the failure. Token/cost impact
was not measured.

## Hypothesis
Local process scheduling or startup overhead may have exhausted the deadline.
Cause is unknown; do not infer a product defect or simply increase the timeout.

## Improvement and validation
Rerun only the failed case after the original process exits. Preserve both
results. If it recurs, inspect stub executable resolution and process timing
before changing the test deadline or introducing retry behavior.

## Resolution
Focused rerun of the same case passed without code changes in 3152.5 ms
(test process 3560.4 ms). Root cause remains unknown; exact-head CI will provide
independent execution evidence. This pass does not erase the first failure.
