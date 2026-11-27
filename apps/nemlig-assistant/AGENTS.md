# Nemlig Food Assistant app contract

Read the repository-root `AGENTS.md` before Nemlig work. For any work in this
app, also apply this file. Then select the matching app-local skill:

- Load `.codex/skills/nemlig-production/SKILL.md` for production readiness,
  deployment, provider, or hosted-service operations.
- Load `.codex/skills/nemlig-basket/SKILL.md` for product search, draft review,
  basket review, or any basket operation.
- Load both only when the task genuinely spans both scopes. Loading a skill
  never authorizes credentials, provider changes, production changes, or a
  basket mutation.

- Keep credentials, tokens, cookies, profiles, and support output private. Ask
  the user to run interactive login; never put a password in arguments or logs.
- Search, favorites, and basket viewing are read-only. Repository work,
  authentication, a spec, or tool availability never authorizes a mutation.
- Additions are strictly additive and must follow the exact review, authorization
  and readback contract in the basket skill. A requested quantity means units
  to add. Two separately confirmed operations may delete real basket contents:
  remove one entire reviewed product line or clear the reviewed basket. Show the
  affected lines and quantities, require explicit confirmation after review,
  recheck the full baseline, dispatch once and verify the resulting basket.
  Decline incomplete or stale state and never replay an uncertain write. Partial
  decreases, replacements, swaps, checkout, payment, orders and slot changes
  remain prohibited. Temporary draft edits are local. Live mutation tests need
  separate authorization for the specific basket change.
- Production/provider work must follow `nemlig-production` and
  `docs/cloudflare-operations.md`. Preserve authentication-before-wake,
  one-Container, bounded-work/retry and manual kill-switch controls; ask before
  provider changes, secrets, or material cost. The owner explicitly removed all
  app-local request and usage quotas; do not reintroduce them as family tiers.
- For ChatGPT connector, OAuth, stale-card, served-UI, or provider-search
  failures, read `../../docs/chatgpt-connector-recovery.md` before changing anything.
  Treat the ChatGPT connection, Cloudflare Worker/Container, Auth0, and Nemlig
  owner session as separate boundaries; change only the layer supported by
  evidence. A server release does not imply a plugin ZIP update, and a gateway
  HTTP 200 does not prove the MCP tool succeeded.
- Every Nemlig native smoke or regression run must select and report each
  applicable stable failure ID from `../../docs/nemlig-failure-compendium.md`,
  including **PASS**, **FAIL**, **BLOCKED**, **NOT RUN**, or justified **N/A**
  with evidence/reason. Preserve unknown root causes as unknown, record first
  occurrences and recurrences, and never retry an uncertain provider write for
  regression purposes. The compendium does not grant authority for live writes.
- For shipped user-visible behavior, update the README feature inventory; keep
  planned work in `BACKLOG.md` or a linked OpenSpec change.
