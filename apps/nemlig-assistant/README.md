# Nemlig Assistant

<p align="center">
  Search current Nemlig products and make precisely authorized basket changes.
</p>

<p align="center">
  Search and compare in conversation, save native Nemlig shopping lists, and
  inspect the actual basket. Explicit list-to-basket submission verifies the
  basket addition before removing an unchanged source list.
</p>

<p align="center">
  <a href="#start-here">Start here</a>
  <span> | </span>
  <a href="#what-you-can-do">What you can do</a>
  <span> | </span>
  <a href="#how-basket-changes-work">Safety</a>
  <span> | </span>
  <a href="#run-it">Run it</a>
  <span> | </span>
  <a href="#development">Development</a>
</p>

---

## Your grocery copilot, with you still in charge

Nemlig Assistant is an unofficial Node.js and TypeScript assistant for
nemlig.com. It helps you find current products, collect them in an unsaved
draft, and save or update shopping lists owned by Nemlig.

Use it from a terminal or connect its MCP server to an AI client such as
ChatGPT. The assistant can do useful read-only work immediately. Basket writes
require an explicit Submit action on a saved list.

It has no recipe, order, payment, or checkout capability. It is not affiliated
with or endorsed by nemlig.com or OpenAI.

<a id="start-here"></a>

## 🚀 Start here

Once connected, try prompts like:

- “Find organic milk and show the current detailed results, compared by unit price.”
- “Start a shopping-list draft with these products.”
- “Show my Nemlig shopping lists.”
- “Update my Family shopping list with these changes.”
- “Show my Nemlig basket.”
- “Which Nemlig Assistant version and codename are running?”

Product search and Nemlig basket reads are read-only. Draft changes stay
temporary until you explicitly save a shopping list. Saved-list edits stay
staged until you explicitly update that list. Submit transfers one saved list,
verifies the additive basket readback, and removes the source if its final
contents check still matches. An edit can race that last check; observed
changes or uncertain cleanup keep the list and show a warning.

<a id="what-you-can-do"></a>

## ✨ What you can do

### Search and inspect products

- Translate or normalize ordinary product wording into one short Danish
  catalogue phrase before searching; preserve distinctive brands and include
  the Danish category (`Prince cookies` becomes `prince kiks`).
- Enrich every provider- or caller-selected search result with exact current
  product details in provider order; no application result cap is invented.
- Mark an individual detail failure as unavailable instead of presenting a
  shallow row as complete, while preserving other successful results.
- The local CLI also supports favorites, department browsing, and exact details;
  the MCP catalog uses `find_groceries` for product discovery.
- Compare product name, ID, package, price, unit price, discount, organic
  status, availability, product description, item details, and other known
  classifications when Nemlig supplies them.
- Use one shared product presentation when the host supports it, with a
  structured and plain-text fallback for headless clients.

### Work with shopping lists and the basket

- Inspect the current basket without changing it.
- Discover native Nemlig shopping lists and reopen them in the shared product
  viewer.
- Keep a new selection as an unsaved draft until you choose **Save shopping
  list**. Saving writes the displayed products and quantities to Nemlig and
  verifies the saved list.
- Stage changes to an existing list locally in the viewer. **Update shopping
  list** writes those changes and checks the provider readback.
- Explicitly **Submit** a clean saved list to add it to the actual basket. The
  app rechecks the exact list and basket baseline, transfers once, verifies
  additive basket readback, and keeps a durable no-replay fence. After the
  readback, the app checks the source again and deletes it only if its identity
  and contents still match. An edit can race the final check; observed changes
  or uncertain cleanup keep the list with a warning. Submit errors distinguish
  a stopped preflight from an unconfirmed transfer; an uncertain transfer still
  requires basket inspection before another attempt.
- Use the actual basket view to inspect Nemlig's basket.

### Use the interface that fits

- Run a local CLI for direct terminal workflows.
- Use the stdio MCP server with a local MCP client.
- Use the HTTP MCP server behind Auth0.
- Connect ChatGPT to the private hosted Cloudflare deployment.
  - Rich product results may use the shared MCP Apps resource;
    structured and plain-text results remain available without UI support.

### Hosted family alpha

The production profile is designed for private, low-volume family use:

- Auth0 authenticates before useful requests reach the backend.
- One fixed Cloudflare Container can sleep when idle and cannot horizontally autoscale.
- No app-owned request throttles, daily/monthly quotas, usage tiers or counters.
  Provider/platform limits are not bypassed; there is no app-enforced billing cap.
- `MCP_ENABLED` provides an immediate manual kill switch.
- Explicit timeouts and bounded retries prevent failed work from running forever.

See [Cloudflare hosting assessment](../../docs/cloudflare-hosting-assessment.md)
and [Cloudflare operations](../../docs/cloudflare-operations.md) for the
architecture, cost controls, deployment, rollback, and emergency procedures.
Use the [production-readiness gate](../../docs/nemlig-production-readiness.md)
for one repeatable credential-free repository and CI check.

## 🧭 Product discovery and review

ChatGPT searches with short Danish catalogue terms and receives current exact
details for selected results. Results retain provider order and identify partial
or unavailable detail reads explicitly. Provider descriptions and declarations
are converted from HTML to bounded plain text; scripts, styles, images, and link
destinations are omitted.

The shared product viewer supports unsaved drafts and selected native shopping
lists. It reuses product details, alternatives, quantity, remove, and accessible
touch and keyboard controls. New product choices stay in a process-local draft
until explicit Save. Saved-list changes stay staged until explicit Update. Save
and Update use a durable, owner-scoped journal so an interrupted provider write
can be inspected without blindly replaying it. Recovery storage is bounded; if
it fills, the action fails closed and existing recovery evidence is retained.

Old Local Basket cards route to native shopping-list discovery. Their saved data
and storage namespace have not been deleted, but Local Basket mutations are no
longer active. A shopping-list transfer uses one native request, additive
basket readback, a durable no-replay receipt, and a final source-list check
before cleanup. The provider has no conditional delete, so an edit can race
that check.

Run `pnpm nemlig:smoke:review-ui` and `pnpm nemlig:build:storybook` from the
repository root for synthetic viewer coverage. These checks use fixtures and do
not write to a Nemlig account. They do not prove native ChatGPT rendering or
production acceptance.

## 🛡️ How basket changes work

```text
Search and review → explicitly Save or Update a Nemlig shopping list → verify its readback
```

- Product search and actual Nemlig basket inspection are read-only.
- Saving a draft creates a native Nemlig shopping list. Updating a saved list
  writes only the staged changes to that selected list.
- Draft saving writes up to two products at a time and checks Nemlig's list
  afterward. If some products are missing, the draft can resume on the same
  list, or you can review and submit only the products Nemlig actually saved.
- Save and Update do not authorize or perform a basket addition. Submit uses
  the selected saved list only after review and explicit basket authorization,
  then verifies the resulting Nemlig basket.
- An interrupted or uncertain Save or Update is inspected through its durable
  recovery record. The assistant does not blindly replay it. If recovery storage
  is full, it fails closed and keeps existing records.
- Old Local Basket identifiers do not identify native lists. Historical cards
  route to shopping-list discovery; the legacy Local Basket data and namespace
  have not been deleted by this change.
- The assistant never removes basket items, checks out, places an order, or pays.

Repository work, choosing products, or review preparation never authorizes a
basket mutation. Operators must read [`AGENTS.md`](AGENTS.md) and the
[`nemlig-basket` skill](.codex/skills/nemlig-basket/SKILL.md).

<a id="run-it"></a>

## ⚙️ Run it

Run commands from the Everyday Assistants repository root.

### Local CLI

```sh
pnpm nemlig --help
pnpm nemlig login --save
pnpm nemlig search "mælk" --limit 5
pnpm nemlig favorites --limit 5
pnpm nemlig departments
pnpm nemlig browse /frugt-og-groent --page 1 --limit 20
pnpm nemlig cart
```

Run login yourself in a terminal. Password input is masked and there is no
password command-line option. Saved credentials remain in the legacy
`~/.nemlig-shopper/credentials.json` path with owner-only permissions;
`NEMLIG_USERNAME` and `NEMLIG_PASSWORD` take precedence when both are present.

Basket CLI commands exist for deliberate local use:

```sh
pnpm nemlig add 701015 --quantity 1
```

The CLI has no provider-basket remove or clear command. `add` means add this
many units to the existing Nemlig line; it does not set the line to that
quantity.

### Local MCP server

```sh
pnpm nemlig:build
pnpm nemlig:mcp
```

The MCP surface is organized around household actions:

- Find exact groceries with `find_groceries`.
- Verify the Nemlig account connection: `check_nemlig_connection` performs a
  bounded read-only provider check and reports missing credentials, provider
  reauthentication, or provider unavailability separately.
- See the actual Nemlig basket: `show_my_basket`.
- Show or build a Local basket: `start_product_review`; refresh, change quantity, remove,
  find alternatives, append products, finish shopping, or prepare the whole list
  with `update_product_review_conversation`. Show can recover the active
  conversation review without its opaque reference. A start with exact items
  creates a separate Local basket; omit items to reopen the remembered basket
  or show the picker.
- For a visual product request, search exact products and open the native Local
  basket without requiring the user to name a tool. This changes only local review
  state. Omit `items` to reopen an existing list, and add newly found products
  through `update_product_review_conversation`. If the user forbids local basket
  state and later asks for a visual view, explain the conflict and ask whether
  to allow local state; give a concise text result until then.
  Use `show_my_basket` when the user means products already in Nemlig. Tool
  success alone does not prove that a client rendered the Local basket viewer.
- Submit all exact Local basket lines after a clear conversational add instruction
  or the viewer's separate on-screen exact confirmation:
  `submit_product_review_conversation`.
  Local presence alone is not provider-write authorization. The protected
  tool uses only the unchanged prepared lines; confirmed unavailable products
  are skipped and reported while other approved products can proceed. Unresolved
  identity or availability details fail closed; missing price, package, category,
  or descriptive fields may remain unknown. Ambiguous scope or changed
  IDs/quantities requires clarification.
- Nemlig Assistant is strictly add-only for the real
  basket: it cannot remove, decrease, replace, swap, or clear products. If two
  units are already present and two more are authorized, the resulting line is
  four units. The provider accepts an absolute quantity, so the assistant
  re-reads the basket and sets the resulting positive quantity; stale or
  incomplete state fails closed. Nemlig does not expose an atomic increment or
  compare-and-set here, so an edit made simultaneously on Nemlig.com can race
  that read/set boundary. Manage removals and clearing directly on Nemlig.com.
- Search and conversation-side edits return structured and text results without
  mounting a widget for every tool call. `start_product_review` is the explicit
  render action: it opens the current products immediately. Use it once while a
  current card is usable; repeat it to reopen the current list when asked.
  Supported cards share the same server-owned Local basket and read its current
  state; a new card does not invalidate earlier supported cards or restore an
  older snapshot. ChatGPT may retain older message cards in the conversation.
  Model-side text actions use the `_conversation` tool names. The MCP server
  serves one stable viewer URI; retired resource addresses are inert and cannot
  change shopping state.
  The viewer initializes the MCP Apps bridge and reports connection failures.
  It can edit the server-owned Local basket and call the protected submission path
  only after the existing exact confirmation; it never calls Nemlig directly.
  `update_product_review_conversation show` remains the headless way to recover current state.

After this connection recovery, use the app named `Nemlig Assistant`.
For ordinary later releases, use **Refresh** on that app so ChatGPT rediscovers
tools, schemas, instructions, and resources. Create a replacement only for a
deliberate integration reset, then retire the previous Nemlig app after the
replacement passes authenticated read-only acceptance.
Use ChatGPT's **Reconnect** setting when authorization has expired;
invalid tokens also trigger that prompt
automatically.

Direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, and
`clear_cart` MCP tools intentionally do not exist. Every basket change uses the
Local basket's protected whole-list prepare/submit path, fresh validation and verified readback.
A clear request to add the current exact Local basket is its own
authorization; ambiguous or changed contents require approval of their exact
prepared change.

### Auth0 and hosted MCP

The maintained hosted path is the single-Container Cloudflare profile described
in [Cloudflare operations](../../docs/cloudflare-operations.md). It is the only
supported ChatGPT deployment. The CLI and stdio MCP server remain available for
direct local development and use; they are not a ChatGPT hosting fallback. The
stdio server keeps Local review text-only and process-local; it does not
advertise the durable hosted basket viewer.

Hosted identity is resolved from the validated Auth0 subject. The only supported
private policy is schema v3: revision, explicit `owner_subject`, and configured
family identities with opaque keys and enabled flags. Old schemas, inline
credentials, tiers and budgets are rejected without compatibility adapters.
Each member has independent sealed credentials, sessions and basket proposals;
unknown or disabled identities are rejected before backend work. There are no
app-local rate limits, daily/monthly quotas or usage counters. The manual kill
switch, deadlines, bounded retries and one-Container ceiling remain; none is a
hard billing cap. External provider/platform limits still apply.

Auth0 validation, principal authorization, and MCP discovery do not need a
Nemlig login. Provider-backed tools remain credential-gated and return the
connection-required result until a Nemlig connection is provisioned.

When the provider portal is enabled and configured by the operator, `/connect`
offers **Sign in** for the configured owner using the installed MCP OAuth client
and PKCE. A verified owner resource token establishes the existing short-lived
signed portal cookie; tokens are not returned to the page or chat.
Native connection forms retain their same-origin header for strict origin and
single-use CSRF checks; no referrer is sent to other origins.
Opening or signing in to the page never replaces stored Nemlig credentials.
Standard resource bearer entry remains available to configured family members. Enter
only your own Nemlig login in that separately authenticated page. Never send it
through ChatGPT or a tool argument. The page can replace or revoke your
connection; the owner can disable or revoke invitee access. Follow the disabled-first
[self-service procedure](../../docs/cloudflare-operations.md#self-service-credential-onboarding).

For a credential-free native-form regression, run
`pnpm nemlig:smoke:onboarding` and open its loopback URL.
Use only the printed synthetic credentials, click **Connect**, then
**Revoke connection**: both must succeed. This exercises the real portal
renderer, signed cookie and single-use CSRF store with no OAuth/Nemlig access.
It is not a live owner-connection or native ChatGPT acceptance test.

The MCP server advertises the Nemlig Assistant grocery-basket icon and the display name
`Nemlig Assistant` to clients that render standard MCP app metadata. The ChatGPT
plugin listing uses its own logo and composer-icon fields.

Creating or changing identity, hosting, DNS, runtime secrets, or paid resources
is an owner-controlled infrastructure action. Nemlig credentials must stay out
of the repository.

## 🧪 Owner alpha exercise

1. Search for a product phrase that needs Danish normalization and inspect the
   returned detailed results.
2. Start an unsaved draft, change quantities, and verify that drafting does not
   create or edit a Nemlig shopping list.
3. Save the draft explicitly, inspect the native list readback, reopen that list,
   stage a change, and choose Update shopping list.
4. Inspect the actual Nemlig basket and confirm that list saving and updating did
   not change it. Submit only with explicit authorization; verify the basket
   readback and source-list cleanup outcome.
5. Use fixtures for interrupted and uncertain write scenarios. Live transfer
   testing requires separate authorization for the exact basket addition.

<a id="development"></a>

## 🛠️ Development

```sh
pnpm lint
pnpm build
pnpm check
pnpm test
pnpm smoke
pnpm nemlig:smoke:package
```

Tests use synthetic HTTP responses and never access a real Nemlig account.

The MCP resource uses the permanent `ui://nemlig/shell.html` identity. Its
small HTML shell fetches `/ui/nemlig/manifest.json` without credentials or
cache, validates the manifest and fixed-origin content-addressed JS/CSS with
SRI, then loads that bundle once for the current mount. The existing Worker
serves only the generated `/ui/nemlig/` static files; these requests do not
enter MCP or wake the Container. The manifest and assets ship with the Worker.
The existing deploy path validates and retains one predecessor asset generation
for cards using the previous shell bundle. Its public edge acceptance checks
the candidate manifest, asset bytes, CORS, MIME and cache headers; no new asset
service or dependency is used.
The package includes the shell, manifest, and hashed assets; browser smoke
drives the real UI through a synthetic MCP host with a fake catalogue:

```sh
pnpm nemlig:benchmark:review-ui -- --runs 10
pnpm nemlig:build
pnpm nemlig:smoke:review-ui
```

Google Chrome must be installed. The report records its version so runs can be
compared against the same browser build.

The benchmark records shell raw/gzip size, estimated gzip size for the shell,
manifest, and assets, first contentful paint, first product DOM insertion (not paint),
load milestones, and product-detail opening response against synthetic
product data in equivalent same-origin parent/iframe hosts.
Each sample uses a fresh browser context; the browser process is reused.
External requests are blocked. The separate browser smoke exercises review
actions and submission confirmation with synthetic host responses; it forbids
provider writes. Timing is advisory, not a CI gate. Host acceptance remains a
separate release gate.

### Reverse-engineered Nemlig API

[`nemlig-api.openapi.json`](nemlig-api.openapi.json) is the canonical,
OpenAPI-compatible inventory of the private Nemlig HTTP endpoints this app uses
and the additional endpoints observed in the first-party website. It records
parameters, partial response schemas, authentication, mutation risk,
confidence, evidence, and whether an operation is `client-used` or only
`observed-only`. It is intentionally permissive about unknown response fields
and is not an official or exhaustive Nemlig contract.

When an endpoint or consumed response field changes:

1. Update the manifest without adding secrets, cookies, token values, account
   data, or captured user payloads.
2. Add dated evidence to the operation. Prefer client symbols, sanitized
   synthetic fixtures, first-party bundle strings, or an anonymous read-only
   browser trace.
3. Mark inferred shapes as partial and keep `additionalProperties: true` until
   repeated evidence supports a tighter contract.
4. Run `pnpm nemlig:check:api` and the package tests. The
   drift check fails when a client endpoint is added or removed without a
   corresponding manifest change.

The manifest documents mutation endpoints for completeness; it does not grant
authority to call them or replace the review, explicit-approval, fresh
validation, and basket-readback requirements above.

The private npm-format package is named `nemlig-assistant`; it is installable
from the smoke-tested tarball but remains `private: true` and unpublished to
npm. Its binaries are `nemlig`, `nemlig-assistant`, `nemlig-mcp`, and
`nemlig-mcp-http`. npm publication requires a separate approved change and is
not a deployment shortcut.

Maintainers can use the release tools when a change needs a new application
identity:

```sh
pnpm nemlig:release:plan --codename Callsign
pnpm nemlig:release:apply --codename Callsign
pnpm nemlig:check:version-bump --base origin/main --head HEAD
```

The version check compares committed revisions, not uncommitted manifest edits.
It supports release planning, but it does not decide whether a deployment is
safe. Production delivery is tied to the exact Git commit that passed the
required checks, so release metadata can evolve independently of deployment
eligibility.

For a release-bearing change, the maintainer chooses a short, single-word
codename and records it alongside the semantic version in
`release/codenames.csv`. Names are checked case-insensitively to avoid reuse.
Release notes live in `release/notes/<version>.md`; each begins with an
`In plain language` summary, with unfamiliar aliases and release terms linked
to the shared [release glossary](../../docs/release-glossary.md).

Version and codename are human-facing identity metadata. They remain available
to the deployed MCP instructions, while the codename ledger and runtime
dependency remain supported until a separate identity migration is reviewed.
Production deployment does not publish the npm package or depend on a release
publication step; any publication helper is maintained as separate legacy
tooling.

Nemlig runtime fixes require a patch, features a minor, and breaking changes a
major. New releases use plain `major.minor.patch`; their codename is stored and
validated separately. `Nemlig-Release: none` is the exact commit-body trailer
for a reviewed runtime change that must not publish. Documentation, tests,
release tooling, and unrelated changes are release no-ops and change neither
version nor codename.

## 📋 Maintained feature inventory

This README is the user-facing inventory of shipped feature sets:

- account access
- product and department discovery
- native Nemlig shopping-list discovery
- temporary unsaved drafts with explicit Save
- staged native-list edits with explicit Update and verified readback
- owner-scoped durable recovery journal for interrupted Save and Update actions
- shared product presentation with accessible details and alternatives
- read-only actual Nemlig basket inspection
- explicit saved-list-to-basket Submit with additive readback and durable no-replay
- CLI, MCP, Auth0, and bounded Cloudflare hosting
- credential-free production-readiness gate
- private package and guarded SemVer release policy
- deployed version and codename identity

The old Local Basket mutation flow is inactive. Its backing data and namespace
remain untouched pending a separately reviewed migration and retirement plan.
Update this inventory whenever shipped behavior changes. Planned work belongs in
[`BACKLOG.md`](BACKLOG.md) or an active OpenSpec change.

## 🗂️ Project map

```text
.codex/skills/nemlig-basket/  Safe shopping workflow
.codex/skills/nemlig-production/  Production-readiness workflow
src/client.ts                 Nemlig HTTP, search, and basket client
nemlig-api.openapi.json       Reverse-engineered private HTTP contract
src/config.ts                 Local credential management
src/cli.ts                    CLI entry point
src/mcp.ts                    MCP server and composable tool surface
src/http.ts                   Authenticated HTTP MCP transport
src/cloudflare-worker.ts      Gateway, Container, and Durable Objects
src/product-discovery.ts      Request-scoped detailed product hydration
src/product-presentation.ts  Shared factual product projection
src/product-review.ts        Private temporary voice/touch review drafts
src/product-viewer.ts         Packaged product viewer and headless fallback
src/proposals.ts              Proposal store, revalidation, and mutation lock
release/                      Version and publication policy
scripts/smoke-package.ts      Installed-package interface proof
scripts/check-api-manifest.mjs  Manifest and client drift check
```

## Upstream baseline

The rewrite targets `mhattingpete/nemlig-shopper` commit
`65a681c1c5510ce03886ed16305b0a2d652c5be1`. Login/logout, session setup,
search, category fallback, product classification, basket operations, CLI, MCP,
ranking, and the optional proposed-basket review are included. Recipe parsing and all
checkout/order/payment capabilities are intentionally excluded.
