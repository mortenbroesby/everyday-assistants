# Nemlig Assistant production readiness

Nemlig Assistant uses one credential-free repository gate for production-alpha
evidence:

```sh
pnpm nemlig:production:ready
```

The command runs, in order:

1. strict OpenSpec validation;
2. the public-tree privacy check;
3. root lint, build, type checks, tests, coverage tasks, and smoke tests;
4. the packed private-package interface smoke test; and
5. a Cloudflare production dry run.

It does not read production credentials, contact Nemlig, deploy Cloudflare,
change Auth0 or DNS, publish npm packages, create GitHub issues, or mutate a
basket. CI runs this same command with read-only repository permissions.

## Owner-run live evidence

Live checks remain separate from the automatic gate:

- `pnpm --filter nemlig-assistant production:probe` checks the deployed edge,
  OAuth metadata, and cheap rejection paths without a token.
- `pnpm --filter nemlig-assistant production:test:features` requires a current
  owner token and exercises authenticated reads, the reserved named-list
  lifecycle, current list resolution, picker metadata, and proposal preparation
  without applying a basket change.
- After deployment, refresh the one existing app named exactly `Nemlig Assistant`
  in place. Do not create a suffixed, bracketed, numbered, or parallel app.
- `pnpm --filter nemlig-assistant production:test:mutation` requires separate
  exact approvals for a mutation and its inverse restoration.

Follow [Verify production features and approved reversible
mutations](cloudflare-operations.md#verify-production-features-and-approved-reversible-mutations).
Repository readiness never authorizes a live check or basket mutation.

## Manual operator actions

Provider and secret actions remain intentionally manual. Use the existing
runbook for [deployment](cloudflare-operations.md#first-deployment-and-current-setup),
[emergency disable](cloudflare-operations.md#emergency-disable-and-re-enable),
[usage and breaker inspection](cloudflare-operations.md#inspect-usage-and-reset-the-breaker),
[secret rotation](cloudflare-operations.md#rotate-secrets),
[rollback](cloudflare-operations.md#roll-back), and
[removal](cloudflare-operations.md#remove-the-deployment).

## Paste-ready evidence update

```text
Nemlig Assistant production-readiness evidence

- Automated repository gate: PASS (`pnpm nemlig:production:ready`, 2026-09-01)
- Implementation commit and exact-head CI: `63d060b0388aa15cd2549147e63264456a7cf9db`
  ([CI passed](https://github.com/mortenbroesby/everyday-assistants/actions/runs/33528527398))
- Live edge probe: NOT RUN unless explicitly recorded
- Authenticated live feature acceptance: NOT RUN unless explicitly recorded
- Reversible basket acceptance: NOT RUN unless separately approved and recorded
- Provider, secret, DNS, publication, GitHub issue, and basket changes: NONE
```
