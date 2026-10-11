# Nemlig Assistant

<p align="center">
  Search current Nemlig products and make precisely authorized basket changes.
</p>

<p align="center">
  Search and compare in conversation. Every real basket change uses exact
  preparation and user authorization; a clear request to add the current Local
  basket is that authorization for all unchanged rows only.
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
nemlig.com. It helps you move from “we need groceries” to a reviewed proposal
with current products, prices, a temporary Local basket, and exact quantities.

Use it from a terminal or connect its MCP server to an AI client such as
ChatGPT. The assistant can do useful read-only work immediately. Basket writes
are deliberately split into prepare, approve, and apply steps.

It has no recipe, order, payment, or checkout capability. It is not affiliated
with or endorsed by nemlig.com or OpenAI.

<a id="start-here"></a>

## 🚀 Start here

Once connected, try prompts like:

- “Find organic milk and show the current detailed results, compared by unit price.”
- “Put these products in my Local basket.”
- “Find an alternative to the cheese in my Local basket.”
- “Show my Nemlig basket.”
- “Add everything in my Local basket to my Nemlig basket.”
- “Which Nemlig Assistant version and codename are running?”

Search and Nemlig basket reads remain read-only. A clear conversational request to
add the unchanged current Local basket authorizes that exact prepared
payload without a redundant second approval; presence in the Local basket alone does not. Other
additions require exact approval, with final revalidation and verified readback.

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

### Review the basket safely

- Inspect the current basket without changing it.
- Read the actual Nemlig basket as structured data and text; this read does not
  open a separate visual card.
- Prepare exact additions from every row in the Local basket.
- Preview the final quantity and price after adding the requested positive
  quantity to each existing line.

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

## 🧭 How product search works

ChatGPT searches with short Danish catalogue terms and receives current exact
details for every selected result. Results retain provider order and identify
partial or unavailable detail reads explicitly. The MCP search result includes
the supported exact product facts; additions from the Local basket stay behind
whole-list preparation and protected submission.

Provider descriptions, declarations, and item details are converted from HTML
to bounded plain text, including Danish characters and entities. Scripts,
styles, images and link destinations are omitted; conversion does not fetch
additional resources.
The shared product viewer opens directly to one **Local basket** list. Every
row is Ready for whole-list submission; there are no To decide/Ready tabs,
checkboxes, or acceptance step. Tap a product to open its full-screen details,
or swipe from right to left to replace that row with inline controls: trash and
a two-arrow **Find alternatives** icon on the left, and minus/quantity/plus on the
right, all on one line.
Full-screen product details use a product-page layout: a back control, centered
product image, name and package metadata, and the three familiar product-information
sections. Local controls stay fixed beneath that information. The controls follow
Nemlig’s familiar basket layout; the rest of the basket stays visible.
Gesture tracking and tap filtering use `@use-gesture/react`.
Left-to-right swipes, vertical scrolling, short drags, and canceled gestures do not
open actions. Keyboard users can press
Shift+F10 on a product. The details view shows the same controls, so touch and
screen-reader users can reach the same actions without swiping.
Close the inline controls with × or Escape to restore the product row. Product
details close with the back control, Escape, or a tap outside.
The inline controls open on release; swiping alone changes no basket state. ChatGPT mobile
gesture handling still needs real-host acceptance. If swipe remains unreliable,
[the tap-layout fallback](https://github.com/mortenbroesby/everyday-assistants/issues/283)
tracks the alternative interaction.
The Local basket scrolls longer lists; large Local baskets render visible rows with
TanStack Virtual while shorter lists stay fully rendered. Product details use the
available app frame height rather than a nested fixed-height panel.
Removing or replacing a row changes only the Local basket, never Nemlig. The
alternative view has Back, the current product, search, selectable results,
and selection: tap a result, then choose **Use selected alternative** to start
the authoritative local replacement. Back and search preserve the original row.
Replacement preserves its quantity and stays Ready. Unavailable results cannot
be selected. Full-screen details use the
three tabs **Varebeskrivelse**, **Varedeklaration**, and **Detaljer om varen**.

The MCP routing map separates catalogue discovery, the actual Nemlig basket,
the Local basket, protected submission and recovery. Reopening uses `show`, not
new searches or a second start. Rows show product, package, quantity and line
price first. The details modal contains product facts. **Submit to Nemlig** prepares every current Local basket row for exact
review before any provider addition. Confirmed unavailable rows are excluded
and reported while available rows proceed. Unresolved identity or availability
details block preparation. Missing price, package, category, or descriptive
fields may remain unknown. Empty Local baskets
introduce the distinction from the real Nemlig basket and offer conversational
shopping starters; they do not call Nemlig or change provider state.
**Submit to Nemlig** is full width; **Clear** is full width at the
bottom of the list and asks for confirmation before discarding the Local basket.

In the hosted deployment, Local baskets are durable data owned by the authenticated
principal, independent of credentials and individual chat sessions. Direct stdio
use is process-local and text-only. Each owner can keep up to 50 unnamed
baskets; each basket can hold up to 500 distinct product lines and expires 24 hours
after explicit activity. The host may remember the selected basket only when it
provides a stable conversation identifier. Without one, the viewer asks the user
to pick a basket. Reconnecting credentials recovers the same non-authorizing
product snapshots, but never a prepared submission or provider authority.
**Clear** asks for confirmation, then deletes only the selected Local basket and
shows the picker. Expired and evicted baskets are unavailable and are never
silently recreated. ChatGPT does not provide a reliable notification when a
conversation is closed.
The baskets are unnamed and are not saved shopping plans. Starting a new basket
does not replace another basket or invalidate its supported cards. Historical
messages must carry their basket ID for mutations; missing or stale IDs lead back
to the picker rather than targeting another basket. Remounts require the current
supported viewer bundle; already-mounted older bundles may not work. After a
local action, the viewer ignores unsolicited host snapshots that could roll it
back, but offers a read-only refresh. Failed mutations are never replayed.
Submitted, uncertain, or known-partial outcomes direct you to inspect the actual
Nemlig basket; a known partial result says how many additions were verified and
that no later write was sent.
The viewer uses the permanent `ui://nemlig/shell.html` identity. The previous
`ui://nemlig/draft-list.html` address and every earlier product-viewer address
resolve only to an inert, read-only notice, so historical cards cannot regain
shopping controls. The stable shell loads the current fixed-origin,
content-addressed UI bundle when it mounts; an active card never swaps code or
replays shopping work. ChatGPT may retain previously cached documents; the
server cannot remove those transcript cards. A release, resource read, and
native rendered build are separate facts: the supported recovery path is an
operator-managed clean connection cutover followed by a new chat.

Run `pnpm nemlig:smoke:review-ui` from the repository root. Its synthetic
browser checks exercise the real MCP adapter, one shared Local basket, right-to-left swipe
actions, alternatives, exact whole-list preparation, failure recovery, and the
packaged viewer. They use fake products and deny provider basket writes; no
credentials are required.

For a reproducible visual review of the current viewer, run:

```sh
pnpm nemlig:ui:mockup
```

It builds the viewer and uses the same synthetic MCP host as the browser smoke
to write `local-basket.png`, `local-basket-actions.png`, `alternatives.png`,
and `confirmation.png` beneath
`apps/nemlig-assistant/.codex/ui-mockups/`. These images are local and ignored:
they contain only fixture products, make no external requests, and never access
the real Nemlig basket. This is a design-review bootstrap, not ChatGPT-host
acceptance.

For component-level visual review, run:

```sh
pnpm nemlig:storybook
```

The local Storybook uses deterministic product fixtures for the shared viewer
pages, including bare production-page stories and two click-through Local-basket
simulators: an embedded-conversation card and a ChatGPT app tab. The host
frames are Storybook-only approximations; the inner page is the same
`ViewerPage` used in production. Host chrome is deliberately not part of the
app UI. A long Local basket story demonstrates scrolling and virtual rows.
`pnpm nemlig:build:storybook` checks that those stories
build. It is not evidence of native ChatGPT rendering: retain the built-viewer
smoke and post-release host smoke for host-owned framing and variables.

Product disclosures, navigation and ordinary local edits do not fetch Nemlig;
adding new exact products hydrates only those products, and
explicit alternatives searches hydrate every unique eligible result in the
single provider response with three concurrent reads and bounded provider
deadlines/retries. This does not enumerate the whole catalogue.

Choose **Submit to Nemlig** to prepare current price estimates and exact quantities for
every Local basket row and show the separate on-screen confirmation. Unavailable
products are named and excluded while available products can proceed; unresolved
product details still require a fresh review. Inspect the full prepared list,
then choose **Add to Nemlig basket** and
confirm that exact addition in the viewer. In conversation, a clear instruction
to add the unchanged current Local basket authorizes only those prepared lines;
if you only ask to prepare/inspect, or any item or quantity changed, the
assistant must ask before submitting. Preparing or showing confirmation does
not submit. The quantities are added in Nemlig; unrelated Nemlig lines stay
unchanged. Editing the Local basket invalidates the pending submission. Verified
success has its own screen and deletes that Local basket. Start or select another
basket for continued shopping. If the result is uncertain or partial, the
attempted basket is inspect-or-delete only. Inspect the actual Nemlig basket;
after confirming the outcome, create a new Local basket and obtain fresh exact
authorization before another submission. The attempted record is never retried.
A known partial result records the verified count and stops before any later
write. There is no automatic retry.

Interactive ChatGPT hosts use their tool bridge. Other hosts retain the complete
structured/text results and equivalent conversational requests; the viewer never
pretends a local action succeeded when no bridge is available.

<a id="how-basket-changes-work"></a>

## 🛡️ How basket changes work

```text
Read → prepare the exact intended change → confirm user authorization → apply once → read back the basket
```

- Search and Nemlig basket inspection are read-only; they never authorize or
  change the Nemlig basket. Local basket edits are local only.
- Every real Nemlig basket change is a positive addition. It starts with
  an exact submission prepared from every current Local basket row.
- A clear instruction to add the unchanged Local basket authorizes only
  those exact additions; the viewer retains its exact on-screen confirmation.
  Other additions require approval for the exact reviewed products and
  additional quantities. No approval authorizes removing, decreasing,
  replacing, swapping, or clearing real basket contents.
  The provider basket is add-only; no approval authorizes removing, decreasing,
  replacing, swapping, or clearing real basket contents. Manage removals on
  Nemlig.com directly.
- Ordinary summaries show names, quantities, useful package distinctions, and
  prices without internal IDs, expiry times, or protocol status fields. Ask for
  “technical details” when those internals are useful for troubleshooting.
- An additions review is connection-bound, short-lived, single-use, and tied to
  exact products, additional and resulting quantities, and the current basket
  contents. Reviewed prices and totals are estimates, not approval limits.
- The default 15-minute review window accommodates a normal ChatGPT approval
  round-trip without weakening final revalidation.
- Product identity, quantity, or basket-content changes invalidate the
  approval. Missing prices do not block an addition; a product confirmed
  unavailable is skipped and reported while other approved products continue.
- The approved action freshly resolves every affected product upstream and
  revalidates the review and current basket state before writing. A failed
  lookup that cannot confirm unavailability stops before any write.
- Additions re-read the basket immediately before writing and verify exact
  resulting lines and quantities afterward. Nemlig may return lower, higher,
  or missing prices; an unavailable total is shown as unknown. This does not
  place an order or charge a payment method.
- Writes are never automatically retried after an uncertain result.
- Cold login follows Nemlig's ordinary website flags; if Nemlig requires a
  basket decision, the assistant stops rather than selecting a remove/save
  option. Resolve the prompt directly on Nemlig.com.
  Each addition uses the absolute-quantity provider endpoint as a positive
  delta, after a fresh snapshot check; sequential writes verify each readback
  and preserve previously verified lines. The provider has no atomic increment
  or compare-and-set, so a simultaneous edit on Nemlig.com can race the final
  read/write boundary.
- Repeated completed actions return the stored sanitized result without writing again.
- The assistant never orders, checks out, or pays.

Repository work, choosing products, or review
preparation never authorizes a basket mutation. Operators must read
[`AGENTS.md`](AGENTS.md) and the
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

1. Search for a product phrase that needs Danish normalization and inspect all
   returned detailed results.
2. Confirm a partial detail failure is labeled unavailable while other results
   remain in provider order.
3. Inspect the current Nemlig basket and confirm the Local basket remains distinct.
4. Start a Local basket, swipe a product from right to left to reveal its inline controls,
   then choose an action or change quantity; also open and close full-screen
   details and use Shift+F10, confirming edits leave Nemlig unchanged.
5. Prepare the entire Local basket and confirm unavailable products are named
   and excluded while available products proceed; unresolved identity or
   availability details block preparation. Missing price, package, category, or
   descriptive fields may remain unknown. Submission requires a clear instruction
   to add the unchanged list
   or approval of the exact prepared effect. Use fixtures for mutation tests; live basket changes need
   separate authorization.

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
- fresh Nemlig authentication before every provider-backed MCP task
- rich individual short-query product discovery and refinement
- one shared product presentation with a headless fallback
- voice/touch one-list Local basket with a right-to-left swipe row replacement and accessible
  full-screen details, full-page alternatives, and scannable comparisons
- persistent in-place review navigation, compact rows, and confirmed local removal
- complete-per-search alternative results, deliberate follow-up search, and conversation-only Local basket edits
- explicit protected submission of every validated Local basket row
- on-screen exact submission confirmation with conversational fallback
- CLI favorites, department browsing, and exact product details
- seven MCP tools for live profile/release identity, connection check, detailed
  search, actual basket read, Local basket start/update, and protected whole-list
  submission
- exact prepare/authorize/submit basket additions
- easy-to-understand ChatGPT tool names and descriptions
- human-friendly basket reviews and verified results
- CLI, MCP, Auth0, and bounded Cloudflare hosting
- credential-free production-readiness gate
- private package and guarded SemVer release policy
- deployed version and codename identity

Update this inventory and the relevant section above whenever a shipped feature
set is added, removed, or materially changed. Planned work belongs in
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
