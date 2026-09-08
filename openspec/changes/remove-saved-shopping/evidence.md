# Removal evidence

Owner decision, 2026-09-09: remove all assistant-managed saved shopping; native
Nemlig lists may be considered later. No replacement integration or stored-record
cleanup is included.

## Scope and review

- Removed eight MCP tools, snapshot filesystem/HTTP APIs, named-list model and
  application, and the Container outbound storage adapter.
- Kept request-scoped planning, exact proposal consent, revalidation, replay
  protection, basket readback, authentication, quotas and cost controls.
- Retained the original PlanStorage namespace, binding and migration history.
  Its fixed 410 response does not read, write or delete records. The focused
  regression test checks source structure; it is not a live storage probe.
- Integrated the sibling acceptance compatibility patch as `10da1cd`; the broader
  deployment/CI hardening remains owned by its existing thread.
- Bumped the breaking release to `4.0.0-alpha.16`. Updated the roadmap and feature
  docs, and marked older named-list plans superseded without erasing history.

## Verification

Before implementation, the exact MCP catalogue test failed because all eight
retired tools were still registered. Storage-adapter regression expectations also
failed before the corresponding removal. Retained planning and basket tests form
the behavior-preservation baseline.

Full `pnpm nemlig:production:ready` passed: strict validation (17 items),
privacy/public-tree check, `pnpm verify` (198 tests plus 3 smoke tests), packed
package smoke, and Wrangler production dry-run including the Docker build.
Focused product tests passed 44/44, including all eight rejected calls with zero
Nemlig-client calls and an empty configuration directory after planning.
Compiled runtime JavaScript contains none of the eight removed tool names or
the former internal storage hostname. A final strict-spec/diff check also passed.
Exact-main integration and CI results are recorded below after completion. No live Nemlig mutation, provider deployment or record deletion was
performed during implementation.

jCodeMunch was used to trace saved-list imports, snapshot callers and worker
storage before deletion. Changed source files were refreshed individually because
bulk indexing encountered duplicate repository identities. Token savings were not
measured.
