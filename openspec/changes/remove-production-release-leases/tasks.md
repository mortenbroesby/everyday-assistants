## 1. Simplify the deployment command

- [x] 1.1 Replace durable lease/journal acquisition, writes, recovery, reconciliation, finalization, and automatic rollback with one bounded exact-candidate deployment command; focused deployment tests prove no Git-ref or persistent state writes occur.
- [x] 1.2 Preserve exact-main CI provenance, protected-environment checks, effective configuration validation, one-Container/no-active-rollout checks, and bounded edge/service acceptance; focused tests cover source/environment proof, successful service acceptance, and failure without rollback.

## 2. Simplify the production workflow

- [x] 2.1 Reduce routine delivery to trusted candidate gate, serialized build, provider access/preflight, deploy, and read-only acceptance; workflow contract tests reject lease, predecessor-artifact, recovery, and retention steps.
- [x] 2.2 Remove release journal artifact upload, predecessor finalization, manual recovery/reconcile/resume modes, and automatic image/Worker-version retention; no workflow consumer references deleted outputs.

## 3. Remove dependent machinery and document trade-offs

- [x] 3.1 Remove unused retention/recovery commands, tests, failure-summary code, and journal-dependent prerelease publishing; remove package scripts/imports with no remaining caller.
- [x] 3.2 Update production-delivery and Cloudflare-hosting specs, Cloudflare operations docs, and task inventory to describe failure as manual inspection with no lease/journal, automatic restore, or image pruning; strict OpenSpec validation passes.

## 4. Verify and deliver

- [x] 4.1 Run focused workflow/deployment tests, relevant package check/build, and strict OpenSpec validation; inspect the final diff for residual lease/journal/recovery code references.
- [ ] 4.2 Commit and push the isolated branch, open one PR, and verify exact-head CI; do not deploy from the feature branch.
