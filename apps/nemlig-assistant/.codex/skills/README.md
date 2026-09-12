# Repository-local skills

| Skill | Use for | Nemlig access |
| --- | --- | --- |
| [nemlig-basket](nemlig-basket/SKILL.md) | Product search, priced proposals, approved basket changes, and verification | Read-only or explicitly approved mutation |
| [nemlig-production](nemlig-production/SKILL.md) | Production readiness, preflight, deployment, and bounded live evidence | No authority to use credentials or mutate a provider |

These skills inherit [`AGENTS.md`](../../AGENTS.md) and the repository-root
instructions. A skill must not weaken the Nemlig safety contract or grant
authority by being selected.
