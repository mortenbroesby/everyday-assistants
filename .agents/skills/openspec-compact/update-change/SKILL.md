---
name: openspec-update-change
description: Revise existing OpenSpec planning artifacts coherently.
---

# Update

Inspect context and status with the CLI before editing. Use each artifact's
returned dependency/instruction data, update only the requested plan, recheck
status after each artifact, preserve coherent proposal/design/spec/tasks
meaning, and validate strict output. Never edit project code. If intent changes
rather than being refined, recommend a distinct change.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
