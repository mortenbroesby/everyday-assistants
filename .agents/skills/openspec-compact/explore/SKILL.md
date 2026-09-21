---
name: openspec-explore
description: Explore a change without implementing project code.
---

# Explore

Use `openspec context --json`, then inspect `status --json`, relevant
`instructions <artifact> --json`, and existing artifacts. Follow the returned
root/schema and dependency information rather than hard-coded paths. Read
repository evidence, surface contradictions, and record only decisions or
durable findings. Do not edit project code, schemas, or workflow configuration.
If a change is needed, propose it and stop for an apply request.

For a registered standalone store, resolve it once with `openspec store list
--json` and retain `--store <id>` on supported commands.
