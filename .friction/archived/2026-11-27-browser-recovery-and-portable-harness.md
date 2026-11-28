# Browser recovery depended on laptop-local guidance
- Date: 2026-11-27
- Scope: developer harness / Nemlig native acceptance
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/347#issuecomment-7223339230
- Revision: b1ebdf3 (instruction baseline)
- Paths: AGENTS.md, .agents/instructions/, docs/agent-harness-recovery.md
- Category: instructions
- Severity: medium

## Observation and evidence
The primary computer-use service failed to start. An existing PinchTab instance
provided a working fallback after user intervention. Default-instance targeting,
disabled agent sessions, transient blank/sign-in pages, partial rich-text entry
and unsupported flags caused further detours. Native inline rendering timed out;
Open app in tab rendered the existing result and a subsequent temporary quantity
edit was visually verified. The original uncertain creation was not retried.

## Impact
The owner had to steer fallback selection and ask for repository-owned recovery
guidance. Comparable task timing/cost and future recurrence are not measured.

## Hypothesis
Dependency on laptop-global instructions and assumptions about browser state
contributed to avoidable handoffs. The inline timeout's root cause is unknown.

## Improvement and validation
Add portable operating/browser guidance and a fresh-machine recovery map, linked
from AGENTS/README. Check links, privacy and consistency with active CLI behavior.
Keep existing safety, hook trust and no-replay boundaries. No new runtime or
mandatory hook is required.

## Resolution
Instruction coverage is implemented in this branch. Behavioral reduction in
friction and clean-machine restoration remain unverified; evaluate on the next
comparable authorized task rather than replaying grocery actions for testing.

### Ledger disposition

PR #376 delivered the portable recovery guidance. Clean-machine restoration and longitudinal impact remain unverified.
