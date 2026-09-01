## 1. Named-list domain and storage

- [ ] 1.1 Add versioned named-list, line, collection, revision, status, and owner-scope schemas with the twenty-five-list, fifty-line, field-length, and normalized-name bounds; verify focused schema tests cover valid reusable/occasion lists and every rejected bound.
- [ ] 1.2 Implement the local owner-only list repository with atomic index/record updates, optimistic revision checks, duplicate-name rejection, archive/restore, and no permanent delete; verify adapter tests cover create, enumerate, open, edit/rename, conflict, duplicate, archive, and restore.
- [ ] 1.3 Extend the internal HTTP storage adapter and existing fixed storage Durable Object with transactional owner-scoped list routes while preserving legacy snapshot routes; verify Worker tests cover authentication of internal requests, atomic name-index updates, owner isolation, record caps, and sanitized failures.
- [ ] 1.4 Add explicit legacy snapshot-to-list migration that preserves the source snapshot and rejects malformed, duplicate-name, or over-limit input; verify local and HTTP adapter tests prove migration and unchanged legacy reads.
- [ ] 1.5 Confirm Cloudflare configuration still declares one fixed storage object, one fixed Container controller, no alarm/queue/cron/new paid binding, and unchanged quotas and limits; verify `pnpm --filter nemlig-assistant cloudflare:check` passes.

## 2. MCP list experience

- [ ] 2.1 Register the compact `show_my_shopping_lists`, `save_my_shopping_list`, `copy_my_shopping_list`, `set_my_shopping_list_status`, `shop_from_my_list`, and `migrate_my_saved_plan` tools with accurate titles, descriptions, schemas, annotations, and human-friendly text; verify interface tests enumerate the exact surface and side-effect metadata.
- [ ] 2.2 Keep list enumeration/opening storage-only and implement explicit resolution for at most twenty selected line IDs through existing favorites-first planning and basket-gap analysis; verify MCP tests prove opening makes no Nemlig call and resolution makes bounded read-only calls without persisting live results.
- [ ] 2.3 Route list-selected products only into the existing additions review tool and never directly into apply; verify integration tests prove list create/edit/open/resolve/migrate operations cannot call any basket mutation and an approved later apply still requires an unchanged review reference.
- [ ] 2.4 Add stale-revision and ambiguous-name conversation responses that lead with list names while retaining opaque IDs/revisions only in structured data; verify snapshot tests contain no routine UUID or internal-storage narration.

## 3. Nemlig-first routing and visual picker

- [ ] 3.1 Update server instructions and tool descriptions to route current Nemlig price, availability, favorite, product-choice, list-resolution, and ordinary find-or-add intent to Nemlig tools while leaving recipes and general food research unconstrained; verify metadata regression tests cover both Nemlig-first and general-research examples.
- [ ] 3.2 Inspect representative current normalized product results to identify the exact HTTPS Nemlig image origins without logging credentials or basket data, then add only those origins to the picker CSP; verify an allowlist test rejects arbitrary, non-HTTPS, and lookalike hosts.
- [ ] 3.3 Render fixed-size lazy product images with accessible text, no-referrer behavior, and a clean error/absence fallback in single-product cards and guided-plan choices; verify DOM-level picker tests cover valid image, absent image, failed image, and fully usable text-only selection.
- [ ] 3.4 Preserve complete conversational candidate metadata when MCP Apps is unavailable and ensure image loading is direct rather than Worker-proxied; verify resource and gateway tests find no image proxy route, cache, retry loop, or image-byte storage.

## 4. Acceptance, documentation, and release evidence

- [ ] 4.1 Extend the closed tool/resource inventory and authenticated production feature acceptance with Nemlig-first metadata, one deterministic reserved list lifecycle, legacy compatibility, list resolution, picker image metadata, and original-state restoration; verify acceptance tests cannot submit a feature request or apply a basket proposal.
- [ ] 4.2 Update the Nemlig README feature inventory and examples, backlog status, production readiness, and Cloudflare operations with named-list usage, reusable-versus-automatic semantics, image fallback, migration, cost model, rollback, and the owner-only deployment boundary; state prominently that ordinary releases update and Refresh the one exact `Nemlig Assistant` app and must never create `(new)`, bracketed, numbered, or parallel copies; verify documentation links and repository privacy checks pass.
- [ ] 4.3 Apply the required alpha feature version decision and verify the package/version policy accepts the resulting source and documentation diff.
- [ ] 4.4 Run focused Nemlig tests, strict OpenSpec validation, `pnpm verify`, the packed-package smoke test, and the Cloudflare production dry run; record commands and results without deploying, changing providers, or mutating a basket.
- [ ] 4.5 After separate explicit production-deployment authorization, deploy disabled first, prove both routes fail closed and the fixed Container remains inactive, enable the same one-Container version, run the credential-free edge probe and authenticated read-only feature acceptance, Refresh tool discovery on the existing exact `Nemlig Assistant` app in place, prove no suffixed/bracketed/parallel Nemlig app was created, and record list/image readback with no basket apply.
