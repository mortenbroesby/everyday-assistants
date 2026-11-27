# Repository basket skill retained a retired list-discovery instruction
- Date: 2026-11-27
- Scope: developer harness / Nemlig basket skill
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 3aa1158e8d847d8aceb1babcfc276994b05d8eba
- Paths: apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md, apps/nemlig-assistant/src/mcp.ts
- Category: instructions
- Severity: low
- Status: resolved

## Observation and evidence
The MCP section correctly directed saved-list display to show_product_review
with view=saved_lists, but a later paragraph said to use action=list. The
current update_product_review_conversation schema does not expose that retired
action. The dedicated display tool returns the read-only picker; loading an
exact source is a separate start_product_review call with shopping_list_id.

This contradiction was found while tracing issue #241 and auditing the skills
read by native routing trials. No observed trial called action=list, so this
record does not attribute the previous omitted-handle failures to this line.
Installed plugin 0.1.5 drift is a separate record and remains unresolved.

## Impact
One contradictory instruction removed. No additional tool calls, failed tasks,
elapsed cost or behavioral improvement can be attributed to it from current
evidence.

## Hypothesis
A retired instruction survived migration to dedicated display. Git history
would be needed to establish the exact edit that left it behind. The mismatch
with current code is confirmed; its effect on model choices is unmeasured.

## Improvement and validation
Remove the redundant obsolete sentence, retaining the complete current flow
already documented above. Verify against the current show input schema,
registered display metadata and source-loading route. Preserve all add-only,
ownership, approval, privacy and no-replay requirements. No new instruction,
skill, runtime or dependency is needed.

## Resolution
Removed the obsolete sentence in draft PR #371. The existing correct
show_product_review/view=saved_lists instruction and exact shopping_list_id
source-loading guidance remain. Static contract alignment is verified; no
claim of improved agent behavior and no installed-plugin change.
