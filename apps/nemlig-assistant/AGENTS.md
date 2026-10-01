# Nemlig Food Assistant app contract

Read the repository-root `AGENTS.md` before Nemlig work. For any work in this
app, also apply this file. Then select the matching app-local skill:

- Load `.codex/skills/nemlig-production/SKILL.md` for production readiness,
  deployment, provider, or hosted-service operations.
- Load `.codex/skills/nemlig-basket/SKILL.md` for product search, proposals,
  basket review, or any basket operation.
- Load both only when the task genuinely spans both scopes. Loading a skill
  never authorizes credentials, provider changes, production changes, or a
  basket mutation.

- Keep credentials, tokens, cookies, profiles, and support output private. Ask
  the user to run interactive login; never put a password in arguments or logs.
- Search, favorites, and basket viewing are read-only. Repository work,
  authentication, a spec, or tool availability never authorizes a mutation.
- The real Nemlig basket is add-only through this assistant: its contents are
  sacred and SHALL NEVER be removed, decreased, replaced, swapped, or cleared,
  even when a user asks or approves. The user manages those actions directly
  on Nemlig.com. A requested quantity means additional units: if Nemlig already
  has two and the user authorizes adding two, the resulting quantity is four.
  If the provider only accepts absolute quantities, read the current basket and
  set a strictly greater positive resulting quantity; fail closed on incomplete
  or stale state. Never send zero or any quantity at/below the observed value.
  This rule applies to MCP, CLI, provider clients, proposal services, tests, and
  production acceptance. Local selection removal/clear is separate and remains
  allowed. Actual additions must follow the exact prepare/review/authorization/
  apply/readback contract in `nemlig-basket`; checkout, payment, ordering, and
  delivery-slot actions are never allowed.
- Production/provider work must follow `nemlig-production` and
  `docs/cloudflare-operations.md`. Preserve authentication-before-wake,
  one-Container, bounded-work/retry and manual kill-switch controls; ask before
  provider changes, secrets, or material cost. The owner explicitly removed all
  app-local request and usage quotas; do not reintroduce them as family tiers.
- For shipped user-visible behavior, update the README feature inventory; keep
  planned work in `BACKLOG.md` or a linked OpenSpec change.
