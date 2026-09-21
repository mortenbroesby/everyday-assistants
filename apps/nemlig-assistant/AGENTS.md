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
- Basket mutations must follow the complete prepare/review/apply/readback
  contract in `nemlig-basket`; checkout, payment, ordering, and delivery-slot
  actions are never allowed.
- Production/provider work must follow `nemlig-production` and
  `docs/cloudflare-operations.md`. Preserve authentication-before-wake,
  one-Container, quota, rate-limit, retry, circuit-breaker, and kill-switch
  controls; ask before provider changes, secrets, or material cost.
- For shipped user-visible behavior, update the README feature inventory; keep
  planned work in `BACKLOG.md` or a linked OpenSpec change.
