---
name: openspec-sync-specs
description: Sync an implemented delta into the durable main specification.
---

# Sync

Use CLI status and instructions to resolve the selected root and complete
`existingOutputPaths`; never hard-code a store root. Compare each delta with
its corresponding main spec, merge only implemented requirements, preserve
scenarios and conflicts, validate strictly, and report deliberate skips. Do
not duplicate issue prose or invent requirements.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
