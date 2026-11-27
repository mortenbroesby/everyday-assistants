# Installed shopping skill differs from the current tool contract
- Date: 2026-11-27
- Scope: developer harness / Nemlig synthetic model-routing evaluation
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/347
- Revision: 2b5e1ff3c27e61c7cc73b261a8163753ab78ee2c
- Paths: apps/nemlig-assistant/chatgpt-plugin-source/nemlig-shopping/skills/grocery-shopping/SKILL.md, apps/nemlig-assistant/chatgpt-plugin-source/nemlig-shopping/plugin.json, apps/nemlig-assistant/.codex/skills/nemlig-basket/SKILL.md
- Category: environment
- Severity: medium
- Status: investigating

## Observation and evidence
In two fresh Codex gpt-6-astra model turns with the same synthetic fixture and
explicit active draft/context identities, the English request read the repository
basket skill and preserved the exact pair. The Danish request read the installed
shopping plugin skill, selected the right display tool but omitted both
identities and received unavailable. Both made one skill-file read and one MCP
call; neither retried or invoked a forbidden provider operation.

The installed skill identifies version 0.1.5 in its discovered package path and
describes retired action=list/action=select behavior. The repository manifest is
0.1.8 and its skill explicitly describes show_product_review and exact
draft_id/review_context_id. Process-level disabling of plugin tools did not
remove this installed skill from discovery. Evidence and pilot limitations:
draft PR #369, docs/nemlig-agent-engineering-programme.md.

## Impact
One unsuccessful display task in the first two-case pilot. No production
incident, basket mutation, or user-data loss observed. Attribution of that
failure to skill drift is not established. Time spent investigating the mismatch
was not separately measured. Pilot token/timing data remain in the programme doc.

## Hypothesis
Stale discoverable instructions may compete with the current tool description.
Skill selection, model variability, language and absent trusted conversation
metadata are possible factors. Current evidence does not isolate one cause.

## Improvement and validation
Reuse the current repository skill; do not add another reminder or weaken
exact-target validation. Repeat the same prompts, then compare matched contexts
with the current skill versus the installed skill. Record skill selection,
exact arguments, returned draft, forbidden calls and usage separately.
If refreshing the installed plugin is chosen, use its supported update flow and
verify the actually loaded version/content afterward; a repository commit or
server deployment does not update installed instructions.

## Resolution
Open. Repository source already contains the corrected display guidance.
No installed plugin, global configuration, provider or production change made.

### Reversed-order replication
The next Danish trial read the current repository skill and still omitted both
supplied identities. The next English trial read installed 0.1.5 and also
omitted them. Both selected the display tool and received unavailable, with no
forbidden operations. Across four exploratory trials, skill version and
language are not sufficient explanations. The version mismatch remains factual;
do not present updating the plugin as a validated fix for handle omission.
The next candidate targets the display tool description, with matched repeated
model trials required to assess value.
