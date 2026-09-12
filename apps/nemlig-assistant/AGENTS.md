# Nemlig Food Assistant operating contract

Read the repository-root `AGENTS.md` before Nemlig work. For any work in this
app, also apply this file. Then select the matching app-local skill:

- Load `.codex/skills/nemlig-production/SKILL.md` for production readiness,
  deployment, provider, or hosted-service operations.
- Load `.codex/skills/nemlig-basket/SKILL.md` for product search, proposals,
  basket review, or any basket operation.
- Load both only when the task genuinely spans both scopes. Loading a skill
  never authorizes credentials, provider changes, production changes, or a
  basket mutation.

- Use the local TypeScript CLI and inspect its current help instead of guessing
  commands or options.
- Never request, print, copy, log, or commit Nemlig credentials. Ask the user to
  run interactive login; never place a password in command arguments.
- Treat product search and basket viewing as read-only discovery.
- Before adding, resolve exact product, quantity, price, and basket state. An
  authenticated user's explicit same-run “go ahead” may authorize only the
  deterministic clear additions from that request; otherwise show the exact
  review and wait for approval. Changed details invalidate either scope.
- Do not ask for approval twice. Same-run automatic authorization covers no
  unresolved line, later run, removal, replacement, clear, checkout, payment,
  order, or delivery-slot action.
- Before removing one line, show its exact product ID, name, quantity, and total
  and wait for separate explicit approval. Never substitute a basket clear.
- Before clearing, show the exact current basket and wait for explicit approval.
- Never replace a basket, check out, pay, or place an order.
- End every mutation attempt with the automatic basket readback. Stop and report
  partial success, failed verification, or any mismatch.
- Repository work, a spec, authentication, or tool availability never authorizes
  a Nemlig mutation.
- Model-visible writes must use the matching prepare tool followed by its apply
  tool only after approval. Direct MCP mutation tools are prohibited.
- Follow `../../docs/cloudflare-operations.md` for private ChatGPT production
  setup. Never commit infrastructure credentials, runtime secrets, or support
  output.
- Treat the hosted service's one-Container maximum, authentication-before-wake,
  quotas, rate limits, circuit breaker, bounded retries, and manual kill switch
  as cost-safety requirements. Any change that could weaken them or materially
  increase family/user operating cost requires a cost-impact summary and human
  direction before implementation or Cloudflare mutation.
- Keep the `Feature sets` section in `README.md` current in the same change when
  shipped user-facing functionality is added, removed, or materially changed.
  List only implemented behavior there; keep planned work in `BACKLOG.md` or an
  active OpenSpec change.
- After repository changes, run root verification, commit the scoped work, push,
  and verify the remote ref.
