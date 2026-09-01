## 1. Production gate

- [x] 1.1 Add one root package command that composes strict OpenSpec validation, privacy checking, root verification, the Nemlig packed-package smoke test, and the Cloudflare production dry run; verify the command names resolve and no step requires credentials or live provider access.
- [x] 1.2 Update CI to call the same aggregate command on pull requests and `main`; verify the workflow retains read-only permissions, frozen installation, and no secret or deployment step.

## 2. Agent and maintainer workflow

- [x] 2.1 Add `apps/nemlig-assistant/.codex/skills/nemlig-production/SKILL.md` with preflight, automated gate, optional owner-run live evidence, and handoff boundaries; verify it refers basket operations to `nemlig-basket` and requires explicit authority for provider or basket mutation.
- [x] 2.2 Add `docs/nemlig-production-readiness.md` as a concise automated/live/manual evidence index and link it from the Nemlig README; verify every referenced command and operations heading exists without duplicating secret, deployment, rollback, or mutation procedures.

## 3. Verification and evidence

- [x] 3.1 Run the aggregate production-readiness command and verify strict specifications, privacy checks, root quality checks, packed installed interfaces, and the Cloudflare dry-run artifact all pass.
- [x] 3.2 Run strict validation for this OpenSpec change and inspect the scoped diff for credentials, local artifacts, unrelated edits, weakened quotas/retries/kill switches, and accidental runtime or dependency changes.
- [x] 3.3 Record automated results plus clearly pending owner-run live acceptance in a paste-ready GitHub issue update; verify it does not claim deployment, provider configuration, live acceptance, or basket mutation occurred when it did not.

## 4. Delivery

- [x] 4.1 Commit only the production-readiness scope to `main`, push it, and verify `origin/main` resolves to the delivered commit on top of the completed OpenSpec archive baseline.
- [x] 4.2 Report the branch, commit SHA, remote-ref verification, CI status if available, and the exact next owner-run acceptance command without executing any provider or Nemlig mutation.
