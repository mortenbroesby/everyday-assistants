# S5 workflow trust preparation

Status: test plan prepared, not implemented. S5.1 remains unchecked. Baseline
`1b5df9ebe09820a0ba934e803b0d46799df7675c` has exact-head green CI and completed
S1/S2. Executable workflow integration still requires S4 and the selected
identity/protection contract; this packet does not waive those dependencies.

## Reuse and scope

The existing `production-deploy.test.ts` already exercises wrong repository,
workflow path/ID/name, PR provenance, stale source, malformed dispatch SHA,
missing/skipped/duplicate required jobs and main advancing before mutation.
Reuse those tests and `verifySource`; do not duplicate them in a mock workflow
engine or call their no-Wrangler assertion proof of no secret exposure.

The missing boundary is GitHub job admission before candidate checkout and
credential injection. `.github/workflows/ci.yml` is ordinary credential-free
verification, not a production dispatch workflow. There is no production YAML
whose admission behavior can truthfully be verified yet.

After dependencies resolve, Terra owns only the new
`.github/workflows/nemlig-production.yml` and one focused workflow contract test
under `apps/nemlig-assistant/src/`. Root coordinates any necessary shared
`production-deploy.ts` or package edits separately. Start from freshly verified
main in a dedicated worktree, not this historical baseline by assumption.

## Ordered test-first implementation

- [ ] Record the approved environment reviewer/bypass/readiness contract and
  S4 token/release-class CLI interface before writing runnable deployment YAML.
- [ ] Add a failing check against the actual workflow for forbidden events,
  non-main dispatch, malformed SHA and unsafe expression interpolation into
  shell source. Dispatch values enter quoted environment variables, not scripts.
- [ ] Prove the credential-free preflight precedes candidate execution and the
  protected deployment job depends on its success; reject missing readiness or
  absent/mismatched protections before entering that job. Do not treat a marker
  alone as proof of configured protections.
- [ ] Check immutable action pins, exact candidate checkout without persisted
  credentials, frozen credential-free install/build and no PR artifact/cache
  reuse. Reuse existing pinned toolchain; do not add a YAML framework merely for
  this fixed workflow. Inspect installed parsing support before selecting a test
  mechanism, and use structural checks rather than fragile substring matches.
- [ ] Check one fixed production concurrency group, cancellation disabled,
  bounded job timeout and minimal per-job permissions. Secrets must be scoped
  to the exact consuming steps, not workflow/job-wide environment mappings.
- [ ] Exercise the actual preflight command with injected read-only GitHub
  responses for missing environment, wrong branch rule/reviewer policy and main
  drift after approval. Keep orchestration thin; share existing source checks
  where their execution environment permits it. No parallel trust implementation.
- [ ] Run the existing source/recovery tests alongside workflow checks. S5.4
  separately proves Linux orchestration and cancellation with fake provider/token
  endpoints. Static YAML tests do not prove GitHub secret withholding or live
  environment configuration; retain S6 metadata readback and S7 live evidence.
- [ ] Independent reviewer inspects exact workflow bytes and negative traces;
  root runs required verification, commits/pushes and verifies exact-head CI.

Do not commit intentionally failing tests to main, create placeholder secrets,
change existing PR permissions, enable dispatch readiness, access providers or
deploy as part of preparation. No new dependency, hosted service, provider
request, Container wake or additional production cost is introduced by this plan.

## Current readiness conclusion

Preparing this matrix is safe now. Implementing an inert substitute and testing
that substitute would not satisfy S5.1's real job-admission outcome. Complete the
identity decision and S3/S4 first, then apply this packet against the actual
workflow. Until then S5.1–S5.5 remain open, as do provider and live acceptance.
