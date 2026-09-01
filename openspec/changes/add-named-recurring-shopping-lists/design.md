## Context

See `proposal.md` for motivation. The current planner stores schema-version-1 immutable snapshots through a `PlanSnapshotStorage` create/read interface. Local development writes owner-only files; production routes that same interface to the fixed storage Durable Object. The MCP backend already returns product image URLs, but its picker renders text-only cards and its CSP permits only the MCP Apps library host.

The hosted service remains a private single-owner Worker gateway in front of one fixed sleeping Container. Authentication, quotas, rate limits, circuit breaker, bounded retries, kill switch, and proposal-based basket safety must remain unchanged. List operations are private application state, not Nemlig basket mutations, but production list calls still pass through the authenticated MCP path.

## Goals / Non-Goals

**Goals:**

- Add durable named-list state without introducing another provider or runtime component.
- Keep ordinary conversation centered on list names and grocery language rather than opaque IDs.
- Support useful lists larger than one planner request while retaining the existing twenty-line product-resolution bound.
- Preserve optimistic concurrency, owner isolation, legacy snapshot reads, and safe rollback.
- Improve current-catalogue tool routing and visual product distinction without claiming control over ChatGPT's global source selection.
- Add no background work and no material cost-amplification path.

**Non-Goals:**

- Do not move the full MCP runtime into the Worker or split tool execution across two MCP servers.
- Do not schedule list runs, infer household stock, or automatically prepare or apply basket changes.
- Do not add collaboration, sharing, per-family-member permissions, or additional Nemlig account credentials.
- Do not proxy or permanently cache Nemlig product images.

## Decisions

### Reuse the existing plan-storage boundary and Durable Object

Extend the storage abstraction with an owner-scoped named-list repository while leaving the version-1 snapshot create/read path intact. Production will store list records and their index in the existing fixed storage Durable Object; local development will use the existing private configuration directory with atomic replacement and owner-only permissions.

The production key space will be logically separated by a one-way owner-scope digest and record type. It will contain one bounded list-name index plus versioned list records. The digest and internal record keys never enter model-visible results or structured logs.

This is preferred to adding D1, KV, R2, or another Durable Object because the workload is tiny, consistency matters more than global distribution, and the existing fixed object already satisfies restart persistence. Moving list tools into the gateway was rejected because it would duplicate MCP dispatch and metadata for little family-scale benefit.

### Store complete current list records with optimistic integer revisions

Each list record will use a new versioned schema containing:

- opaque list ID;
- display name and normalized-name key;
- `reusable` or `occasion` type;
- `active` or `archived` state;
- created, updated, and archived timestamps;
- positive integer revision;
- up to fifty ordered grocery lines.

Each line keeps its stable line ID, grocery name, default quantity, optional short note, constraints, preferences, and optional preferred product ID. Updates replace the complete ordered line collection and require the expected revision. The Durable Object transaction updates the record and normalized-name index atomically.

Full-record replacement is simpler and safer than a patch language at this scale. It also makes stale-update rejection and tests deterministic. Event sourcing was rejected because list history is not a current product requirement and would add storage and recovery complexity. Archived records remain recoverable; permanent deletion is deliberately omitted.

### Keep list storage separate from live Nemlig resolution

Opening or enumerating a list reads only private list storage. A separate explicit resolution tool accepts a list plus at most twenty selected line IDs, loads the current record revision, and sends those lines through the existing favorites-first planner and basket-gap logic. It does not persist current prices, availability, basket quantities, or newly inferred product choices.

This separation prevents merely viewing a list from waking the Nemlig client or creating request amplification. Fifty stored lines support realistic household and event lists, while the twenty-line live-resolution limit preserves existing upstream concurrency and timeout bounds.

### Expose a small human-readable MCP list surface

Use a compact tool set whose titles read naturally in ChatGPT:

- `show_my_shopping_lists`: enumerate active lists or open one named list;
- `save_my_shopping_list`: create a list or replace one current revision, including rename;
- `copy_my_shopping_list`: duplicate an existing list under a new name;
- `set_my_shopping_list_status`: archive or restore a current revision;
- `shop_from_my_list`: resolve selected lines against current Nemlig data;
- `migrate_my_saved_plan`: explicitly copy one legacy snapshot into a new named list.

List names are accepted for ordinary selection and responses always lead with names. Opaque IDs and revisions remain structured protocol fields for unambiguous follow-up but are not repeated in normal prose. The list-state tools are annotated as non-read-only but non-destructive where appropriate; archive/restore is reversible. None receives or returns an approval reference.

Separate tools for every rename, line edit, archive, and restore operation were rejected because they would enlarge an already substantial ChatGPT tool catalogue and worsen selection. A single generic `manage_list` operation was also rejected because its side effects would be less clear in settings and annotations.

### Preserve legacy snapshots as read-only migration sources

The old save-snapshot tool will no longer be the preferred reusable-state path, but existing UUID references remain loadable. Migration explicitly loads and validates the legacy snapshot, creates a new named list, and leaves the snapshot untouched. No eager migration runs at deployment, so rollback does not depend on reversing stored data.

After one alpha compatibility window and production evidence that no required references remain, snapshot creation can be considered for separate deprecation. This change does not delete snapshot records or silently convert them.

### Improve Nemlig-first selection through metadata contracts

Update server instructions, tool descriptions, and interface tests so requests claiming current Nemlig price, availability, favorites, products, or list resolution point to the relevant Nemlig tools. The contract will distinguish current catalogue evidence from recipes and general food research, for which other sources remain valid.

This improves tool selection but cannot guarantee that every ChatGPT response invokes the app. Requiring the user to mention the app on every turn was rejected as poor usability; claiming the app can disable web search was rejected as inaccurate.

### Render images directly from verified Nemlig image origins

During implementation, capture representative normalized product image URLs and derive the narrow HTTPS origin allowlist from observed current Nemlig responses. Add only those origins to the picker resource CSP. Product cards use fixed dimensions, `loading="lazy"`, meaningful accessible text, no-referrer policy, and an error handler that removes the image region cleanly.

Direct browser loading avoids Worker egress, storage, transformation cost, and another retry path. The picker never inserts arbitrary HTML from product data and rejects non-HTTPS or non-allowlisted image URLs before assigning `src`. Text identity and selection remain complete without an image.

### Keep cost admission unchanged and bound all new work

All list MCP calls remain authenticated and subject to existing useful-operation and per-minute admission before the Container. Storage has hard list and line caps, live resolution has the existing twenty-line cap, and no alarm, queue, cron, retry loop, or additional Container is introduced. Image bytes bypass Cloudflare application infrastructure.

The normal family-scale cost model therefore remains the Workers Paid baseline plus the same single sleeping `lite` Container usage. The worst credible new application behavior is repeated authenticated list calls waking the one Container; existing rate limits, daily quota, circuit breaker, and one-instance ceiling bound that case.

### Update the canonical ChatGPT app in place

The supported app identity is exactly `Nemlig Assistant`. Ordinary releases deploy the existing hosted endpoint and then use Refresh on that app's settings page to rediscover MCP instructions, tools, schemas, and resources. They do not create a second developer app, append `(new)`, brackets, version numbers, or temporary naming, or require the owner to reconnect solely because server metadata changed.

The current app and icon are correct, so this change requires no replacement. Replacement remains a hypothetical exception only if a future required app-level property becomes incorrect and ChatGPT makes that property immutable. Before any such replacement, verify that in-place editing and Refresh cannot correct it. Create the replacement with the exact canonical name only after the superseded copy is temporarily renamed for disambiguation; authenticate and verify the replacement; then permanently delete the superseded copy with action-time owner confirmation. At no point is a suffixed name considered the finished state.

This rule prevents connector clutter, repeated OAuth registrations, user confusion, and needless setup work. Recreating on every release was rejected because MCP discovery is explicitly refreshable and the production URL remains stable.

## Risks / Trade-offs

- **[ChatGPT may still choose web search]** -> Use explicit current-Nemlig metadata and regression fixtures, document that app mention remains a reliable user override, and avoid claiming enforceable global routing.
- **[Product image hosts or URL formats may change]** -> Keep the allowlist narrow and tested, fail to text-only cards, and update it only from observed production data.
- **[Name ambiguity under Danish casing]** -> Enforce normalized active-name uniqueness and keep opaque IDs in structured results for protocol follow-up.
- **[Full-record edits can conflict]** -> Require expected revisions and return the current revision on conflict instead of merging automatically.
- **[Large lists require more than one resolution call]** -> Keep storage at fifty lines but require explicit selections of at most twenty; do not fan out automatically.
- **[A production acceptance list could accumulate]** -> Reuse one reserved, deterministic acceptance list and restore its prior state; if initially absent, leave at most one archived acceptance record.
- **[Legacy support prolongs two schemas]** -> Keep legacy storage read-only and isolate migration logic so a later separately specified removal is straightforward.
- **[A future platform-immutable app property might require replacement]** -> Treat the current app and icon as correct; only if a later defect cannot be fixed in place, prove Refresh/editing cannot fix it, keep the canonical name as the only final identity, verify the replacement before deletion, and require owner confirmation for permanent removal.

## Migration Plan

1. Add schema and adapter tests for list bounds, name normalization, revisions, owner isolation, archive/restore, and legacy migration without changing production configuration.
2. Extend the existing storage Durable Object with transactional list routes while retaining snapshot routes; verify the Cloudflare dry run and one-object topology.
3. Add the bounded MCP list tools, Nemlig-first metadata, picker image rendering, and exact tool/resource inventory tests.
4. Update the README feature inventory and production operations/acceptance documentation.
5. Deploy first with `MCP_ENABLED=false`; verify disabled responses and no running Container, then enable the same one-Container deployment and run the credential-free edge probe.
6. Refresh the existing private `Nemlig Assistant` app in place and run authenticated acceptance: current tool discovery, reserved list create/open/edit/archive/restore behavior, legacy load/migration where a fixture exists, visual picker image/fallback, and read-only list resolution. Do not create a parallel app and do not apply a basket proposal.
7. Roll back by disabling the Worker and restoring the previous verified deployment. New list records are ignored by the previous code; legacy snapshots remain unchanged, so rollback requires no destructive data migration.

## Open Questions

- Confirm the exact current Nemlig image origin allowlist from representative production results during implementation; this does not change the direct-load-with-fallback design.
- Choose the localized user-facing labels for `reusable` and `occasion` after viewing them in ChatGPT; storage values and behavior remain unchanged.
