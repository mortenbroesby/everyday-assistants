---
name: openspec-propose
description: Create concise planning artifacts for a durable contract change.
---

# Propose

Confirm the GitHub issue is the work contract and create OpenSpec only when a
durable user/API/protocol/schema/safety/architecture contract changes. Use
`context --json` and `schemas --json`, scaffold with `openspec new change`,
then use `status --json` and the returned artifact dependency graph. Read each
ready artifact's own `instructions` output before writing it, recheck status
after each artifact, and finish with strict validation. Capture rationale and
rejected alternatives, not copied issue prose. This workflow plans only; do
not implement project code.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
