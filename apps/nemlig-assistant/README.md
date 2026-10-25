# Nemlig Assistant

<p align="center">
  Search current Nemlig products and make precisely authorized basket changes.
</p>

<p align="center">
  Search and compare in conversation, review a temporary draft, add approved
  products to the basket in one request, and optionally save the whole basket.
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
nemlig.com. It helps you find current products, prepare temporary drafts, and make
explicit additive changes to the actual basket.

Use it from a terminal or connect its MCP server to an AI client such as
ChatGPT. The assistant can do useful read-only work immediately. Basket writes
require an explicit Submit action on the reviewed draft.

It has no recipe, order, payment, or checkout capability. It is not affiliated
with or endorsed by nemlig.com or OpenAI.

<a id="start-here"></a>

## 🚀 Start here

Once connected, try prompts like:

- “Find organic milk and show the current detailed results, compared by unit price.”
- “Review these products before adding them to my basket.”
- “Show my Nemlig shopping lists.”
- “Load my Family shopping list into a temporary draft so I can review changes.”
- “Show my Nemlig basket.”
- “Which Nemlig Assistant version and codename are running?”

Product search and Nemlig basket reads are read-only. Choosing products opens a
temporary draft; edits stay local until **Add to Nemlig basket** explicitly
submits the available, unchanged reviewed lines in one additive request. Existing saved lists can
be loaded as read-only sources into a new draft. After a verified addition, the
viewer offers a separate action to save the entire current basket as a list;
this includes existing basket rows and does not clear the basket.

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
- Default alternatives stay within the product's Nemlig subcategory (or category
  when no subcategory is available); an explicit alternatives search can range
  across categories.
- Use one shared product presentation when the host supports it, with a
  structured and plain-text fallback for headless clients.

### Work with shopping lists and the basket

- Inspect the current basket without changing it. After an uncertain submission,
  inspect that exact draft to compare before, requested, expected and current
  quantities from its durable receipt. Matching quantities alone cannot prove
  that this operation succeeded and never permit an automatic retry.
- Submission errors retain safe dispatch/readback stage, failure category and
  HTTP status when known. A provider validation-failure array is represented
  only by its presence, never by raw provider messages or shopping data.
- Discover saved Nemlig shopping lists and load an exact list into a new
  temporary draft. The source list remains unchanged.
- Add, remove, replace, and change quantities in the temporary draft; these
  edits do not write to Nemlig.
- Submit once to freshly check the reviewed products, then add the available
  unchanged rows to the actual basket in one request. Confirmed unavailable
  rows are reported as skipped; price-only changes do not block submission.
  Existing basket rows are preserved and uncertain writes are never retried.
- After at least one verified addition, optionally save the whole current basket as a
  shopping list. This integration does not establish or return a verified
  new-list ID, so find it in the saved-list picker. This action never clears
  the basket.
- Failed draft edits or alternatives requests keep visible products and
  quantities. Recovery names the temporary draft, describes recognized failures
  without exposing raw host errors, and offers **Refresh this draft**. Editing
  stays disabled until a response confirms the same draft and context; a
  malformed response or another draft cannot replace the cached selection.
  Dismissing an error does not replay the failed edit or a provider write.
- Show the current operation while loading a saved list, editing the draft,
  submitting additions, or saving the basket; keep products visible while
  waiting.
- After an error, keep the exact draft and quantities visible and offer a
  targeted recovery. Dismissing an error does not replay a write or restore an
  older host snapshot.
- Partial or uncertain operations distinguish confirmed provider contents from
  unresolved changes. Missing lists never redirect to unrelated lists.
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

The shared product viewer edits temporary, process-local drafts with product
details, alternatives, quantities, removal, and accessible touch/keyboard
controls. Choosing products does not write to Nemlig. A user may load an exact
saved list as a read-only source; its contents are copied into a new draft, and
later edits or basket submission never update or delete that source.

Explicit Submit freshly checks identity, package, and availability, then sends
the available reviewed rows in one additive basket request and verifies the
resulting basket independently. Unprotected drafts expire after
two hours of inactivity; unresolved work keeps a draft available until resolved.
No process-local draft can be recovered after restart. Uncertain basket writes
retain a durable no-replay receipt. After a verified addition, the viewer offers a separate
optional action to save the entire current basket. It preserves the basket and
does not establish or return a verified saved-list ID, so the user can find the
new list in the picker. Uncertain saves are not retried.

The provider endpoint shape was observed in Nemlig's first-party website bundle.
Live acceptance, atomicity, and provider limits remain unverified. The browser
smoke uses synthetic provider responses and does not write to a Nemlig account.

Run `pnpm nemlig:smoke:review-ui` and `pnpm nemlig:build:storybook` from the
repository root for synthetic viewer coverage. These checks use fixtures and do
not write to a Nemlig account. They do not prove native ChatGPT rendering or
production acceptance.

## 🛡️ How basket changes work

```text
Search or load a saved list → edit temporary draft → explicit one-request basket addition
                                                    → optional save of whole current basket
```

- Product search, saved-list discovery, and actual basket inspection are
  read-only. Loading a saved list copies its exact rows into a temporary draft;
  the source remains unchanged.
- Draft selection and edits write only to process-local state. Explicit Submit
  freshly checks each reviewed product, skips confirmed unavailable ones, and
  sends the remaining approved quantities in one additive request. It validates
  basket readback and preserves prior rows. Price-only changes do not block it.
- An uncertain or partial addition is never retried automatically. Inspect the
  actual basket before deciding what to do.
- Saving the current basket as a shopping list is a separate explicit action
  offered only after at least one verified addition. It includes all current basket items,
  preserves the basket, and does not provide a verified new-list ID.
- The observed request builders do not establish live acceptance, provider
  atomicity, or provider limits. Nemlig changes can race the independent
  baseline and readback checks.

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

For a reviewed set of products, `add-many` sends all positive quantity deltas
in one additive basket request and then independently reads the basket back:

```sh
pnpm nemlig add-many 701015:2 2301138:1
```

Each argument is an exact numeric product ID followed by the additional
quantity. IDs must be unique. An uncertain request or mismatched readback must
be resolved by inspecting the basket; the command never retries. The provider
request builder is based on Nemlig's public website bundle. Provider-side
atomicity, limits, and live acceptance have not been verified.

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
- See the actual Nemlig basket: `show_my_basket`. For read-only recovery of a
  previous submission, supply its exact `draft_id`; do not guess handles.
- Create a temporary draft or load a saved-list source with
  `start_product_review`. Exact `items` and positive quantities create a local
  draft without creating a Nemlig list. Pass `shopping_list_id` to load that
  exact saved list as a read-only source into a new draft; omit both to discover
  saved lists.
- Use `show_product_review` when someone wants to show, display, open, browse,
  review, or compare an existing temporary draft. It accepts an exact
  `draft_id` and `review_context_id` pair, or uses only the current trusted
  conversation; `view: "saved_lists"` opens the read-only saved-list picker
  without loading a source. It never creates, changes, submits, or authorizes
  a draft.
- Edit or find alternatives with `update_product_review_conversation`. Carry
  the exact `draft_id` and `review_context_id` from the card. Edits are local;
  use `show_product_review` for a hosted visual review;
  `list` and `select` inspect saved lists or copy one into a fresh draft.
- Submit only after explicit authorization with
  `submit_product_review_conversation`. It sends the reviewed quantities in
  one additive request using the exact draft, review context, and reviewed
  product IDs and quantities, verifies basket readback, preserves existing
  rows, and never retries an uncertain write. No separate preparation action
  is required; every authorized submission uses a fresh unique UUID.
- After verified Submit, the viewer offers `save_basket_as_shopping_list` as a
  separate optional action. It saves the whole current basket, including
  existing rows, and preserves the basket. The endpoint response has no
  verified saved-list ID; use the picker to find it. Uncertain saves are never
  retried.
- The actual Nemlig basket is add-only. The assistant cannot remove, decrease,
  replace, swap, clear, check out, pay, order, or select delivery slots. The
  provider offers no established atomicity guarantee; concurrent Nemlig changes
  may race the independent baseline and readback checks.
- Search remains text-only. In hosted MCP, only `show_product_review`
  advertises the review UI resource; a successful tool result does not by
  itself prove that a host rendered it. `start_product_review` returns draft
  data or saved-list discovery data. Cards carry the exact draft ID and transient
  review context; unprotected drafts expire after two hours of inactivity, while
  unresolved work remains available until resolved. No draft can be restored
  after restart. The viewer uses the MCP Apps bridge and never calls Nemlig
  directly. Local stdio MCP remains text-only.

After this connection recovery, use the app named `Nemlig Assistant`.
For ordinary later releases, use **Refresh** on that app so ChatGPT rediscovers
tools, schemas, instructions, and resources. Create a replacement only for a
deliberate integration reset, then retire the previous Nemlig app after the
replacement passes authenticated read-only acceptance.
Use ChatGPT's **Reconnect** setting when authorization has expired;
invalid tokens also trigger that prompt
automatically.

Direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, and
`clear_cart` MCP tools intentionally do not exist. Basket additions require explicit Submit for the exact displayed draft and
quantities. Searching, loading a source list, and editing the draft do not
authorize a basket mutation.

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
2. Create a temporary draft from selected exact products. Change quantities and
   replacements, then confirm those edits affect only the draft.
3. Load an exact saved list as a read-only source when authorized. Confirm draft
   edits do not change that source and an expired draft is not silently restored.
4. Add to the basket only with separate exact authorization; verify additive
   readback. If chosen, test the optional whole-basket list save separately.
5. Use fixtures for interrupted/uncertain writes. Follow the
   [ChatGPT smoke runbook](../../docs/nemlig-chatgpt-smoke-test.md) for live
   acceptance; repository checks do not authorize provider changes.

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

For the connected picker walkthrough, run `pnpm storybook` from this
directory and open **Picker/Visual contract → AppTabWalkthrough**. It renders
the production `ViewerPage` with clearly labeled simulated host and provider
responses; **AppTabWalkthroughChecks** runs the companion click-through. These
fixtures demonstrate UI behavior only and do not verify live Nemlig responses.

The [hosted Storybook](https://everyday-assistants-storybook.vercel.app/) serves
the same static fixtures from `main`. Vercel's Git integration provides a
distinct preview for each repository-branch PR; external-fork previews require
maintainer authorization. The dedicated Vercel project builds from the
repository root with `pnpm --filter nemlig-assistant build:storybook` and serves
`apps/nemlig-assistant/.codex/storybook-static`. Keep the project free of
credentials and real user data; it is a visual fixture site, not the MCP app.

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
- temporary drafts and read-only saved-list loading
- local draft edits that leave saved shopping lists unchanged
- hosted conversation show/edit actions that advertise the shared review resource
- owner-scoped durable no-replay fences for uncertain direct writes, with
  bounded retention for completed receipts
- shared product presentation with tap-to-open details, press-and-hold actions, and alternatives
- read-only actual Nemlig basket inspection
- one-request additive basket Submit with readback and durable no-replay
- CLI, MCP, Auth0, and bounded Cloudflare hosting
- credential-free production-readiness gate
- private package and guarded SemVer release policy
- deployed version and codename identity

The old Local Basket mutation flow is inactive. Its backing data and namespace
remain untouched pending a separately reviewed migration and retirement plan.
Update this inventory whenever shipped behavior changes. Planned work belongs in
[`BACKLOG.md`](BACKLOG.md) or an active OpenSpec change.

The [architecture integration record](../../docs/nemlig-architecture-refactor-closeout.md)
tracks the #319 refactor evidence and the separate hosted and ChatGPT acceptance gates.
The [#345 conversation incident record](../../docs/nemlig-conversation-issue-345.md)
separates reproduced MCP contract defects from historical host behavior and
product-selection observations.

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
src/product-review.ts        Temporary drafts, read-only list loading, basket
                              review
src/review-schema.ts         Shared MCP review payload and viewer compatibility
src/product-viewer.ts         Packaged product viewer and headless fallback
src/basket-result.ts          Basket response projection and uncertain-write error
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
