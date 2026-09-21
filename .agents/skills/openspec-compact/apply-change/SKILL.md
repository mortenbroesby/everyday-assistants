---
name: openspec-apply-change
description: Implement the next tasks from an approved OpenSpec change.
---

# Apply

Run `openspec status --change <name> --json`, then
`openspec instructions apply --change <name> --json`; read every returned
context file and follow its task order. If status is blocked, inspect the
reported prerequisite and do not invent or silently expand scope. Implement
only approved tasks, update task status/evidence, run focused checks, strict
validation, and the repository gate. Do not expand authority for secrets,
provider, production, or basket actions.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
