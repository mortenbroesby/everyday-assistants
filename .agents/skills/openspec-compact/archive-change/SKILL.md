---
name: openspec-archive-change
description: Archive a completed OpenSpec change after implementation evidence.
---

# Archive

Check CLI status and task completion, then obtain archive instructions and
required spec paths from the CLI. Sync only the implemented delta, validate
strictly, and do not archive incomplete or blocked work. Preserve the issue
link, evidence, and unresolved acceptance/production work; archive is not a
claim of deployment or basket acceptance.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
