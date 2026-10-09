# Nemlig Assistant

<p align="center">
  Search current Nemlig products and make precisely authorized basket changes.
</p>

<p align="center">
  Search and compare in conversation. Every real basket change uses exact
  preparation and user authorization; a clear request to add the current Ready
  draft list is that authorization for those unchanged lines only.
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
with current products, prices, a temporary Draft list, and exact quantities.

Use it from a terminal or connect its MCP server to an AI client such as
ChatGPT. The assistant can do useful read-only work immediately. Basket writes
are deliberately split into prepare, approve, and apply steps.

It has no recipe, order, payment, or checkout capability. It is not affiliated
with or endorsed by nemlig.com or OpenAI.

<a id="start-here"></a>
## 🚀 Start here

Once connected, try prompts like:

- “Find organic milk and show the current detailed results, compared by unit price.”
- “Put these products in my Draft list so I can decide what to add.”
- “Compare the cheese in my basket with this cheaper alternative.”
- “Show my Nemlig basket.”
- “Add the Ready products from my Draft list to my Nemlig basket.”
- “Which Nemlig Assistant version and codename are running?”

Search and Nemlig basket reads remain read-only. A clear conversational request to
add the current unchanged Ready draft list authorizes that exact prepared
payload without a redundant second approval; Ready status alone does not. Other
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
- Prepare exact Ready additions from the Draft list.
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
the supported exact product facts; basket changes stay behind Draft list
preparation and protected submission.

Provider descriptions, declarations, and item details are converted from HTML
to bounded plain text, including Danish characters and entities. Scripts,
styles, images and link destinations are omitted; conversion does not fetch
additional resources.
The shared product viewer opens directly on its products. Each row keeps a
visible product image, readable name, brand/package details, quantity, and line
price together on narrow screens; factual disclosures stay collapsed until
opened. Its buttons, status chips and compact row styling are viewer-local
native controls, grouped in the picker component suite, so the approved
hierarchy does not depend on host component-kit defaults. **To decide** contains
unresolved products; **Ready** contains exact accepted products. Select one or
more To decide rows, then add them to Ready in one local action. In Ready,
adjust quantities directly; open a row to move it back or remove it from the
local Draft list after confirmation. This never changes the Nemlig basket. Choose
alternatives only from To decide; choosing a replacement does not accept it
automatically. Alternatives show every distinct eligible product in the provider
response with comparison facts visible at a glance. The full product row is the
selection target; the separate **Use selected alternative** action applies that
choice. Unavailable results stay visibly unselectable. Longer facts use only
the three collapsed sections **Varebeskrivelse**, **Varedeklaration**, and
**Detaljer om varen**, with all supplied detail fields grouped in the latter.
They allow a deliberate follow-up search when none fit. A search response is not
a claim that the entire Nemlig catalogue was enumerated. These local operations also work
through conversation, including “everything except the ricotta and cucumbers is
fine.” Local acceptance never changes Nemlig.
The MCP routing map separates catalogue discovery, the actual Nemlig basket,
the local draft list, protected submission and recovery. Reopening uses
draft list `show`, not new searches, repeated details or a second start; failed edits are not replayed.
Once explicitly opened, the same current draft list frame stays active across
confirmed local edits and destination changes. Compatible draft lists and open
product rows remain in place. Rows show product, package, quantity and line
price first. Expanded rows contain quantity and local row actions, plus
collapsed **Varebeskrivelse**, **Varedeklaration**, and **Detaljer om varen**
sections; opening them makes no tool call. **Review exact Nemlig change**
prepares the exact products and quantities before any separately authorized
Nemlig basket addition. Empty or ended Draft lists instead offer conversational
shopping starters; they do not call Nemlig or change the local selection.

Voice and touch use one private temporary draft per ChatGPT conversation, identified
by the host session metadata and authenticated principal. There is no hourly expiry.
**Clear draft list and start over** discards the local draft and shows a
conversational starting screen. A restart or bounded memory eviction
can also discard it; missing state is reported rather than silently recreated.
Each principal retains at most eight conversation drafts of up to 500 products. Hosts
without conversation context cannot access a hosted draft. ChatGPT does not
provide a reliable notification when a conversation is closed.
They are not saved shopping plans or named lists. Transcript cards start inactive:
**Open current draft list** reads this conversation’s current draft before showing
products or shopping controls. Reloading an old message does not restore its
historical draft list. When a current viewer detects a stale card, it automatically
reads and displays the current list in that same card, read-only. **Make this card
current** explicitly gives it a fresh view token; this does not edit the list or basket.
If the list is gone, the card asks before starting over. Cards already cached by ChatGPT
cannot gain this behavior; ask in chat to reopen the list from those older cards. A
stale edit refreshes once without replaying it; connection failures hide editing
controls until you explicitly reopen current state.
If the draft is gone, **Start new draft list** rechecks the original products and
quantities without restoring acceptance or submission approval. Submitted or
uncertain snapshots instead direct you to inspect the actual basket.
The viewer uses the permanent `ui://nemlig/draft-list.html` identity. Every
previous product-viewer address resolves only to an inert, read-only notice, so
historical cards cannot regain shopping controls. ChatGPT may retain previously
cached documents; the server cannot remove those transcript cards. A release,
resource read, and native rendered build are separate facts: the supported
recovery path is an operator-managed clean connection cutover followed by a new
chat, not another URI bump.

Run `pnpm --filter nemlig-assistant smoke:review-ui`, open its loopback URL,
and click **Run regression smoke**. The real MCP adapter and fake catalogue
exercise inactive mount/remount, conflicting revisions, a failed connection,
process restart, explicit recovery and clearing the local draft list. The page reports PASS
only when the stale edit was not replayed, restart cleared acceptance while
preserving quantities, and provider basket calls remained zero. No credentials
are required; provider basket access is denied by the fixture.

For a reproducible visual review of the current viewer, run:

```sh
pnpm --filter nemlig-assistant ui:mockup
```

It builds the viewer and uses the same synthetic MCP host as the browser smoke
to write `to-decide.png`, `product-expanded.png`, `ready.png`,
`alternatives.png`, `confirmation.png`, `success.png`, `empty.png`, and
`unavailable.png` beneath
`apps/nemlig-assistant/.codex/ui-mockups/`. These images are local and ignored:
they contain only fixture products, make no external requests, and never access
the real Nemlig basket. This is a design-review bootstrap, not ChatGPT-host
acceptance.

For component-level visual review, run:

```sh
pnpm --filter nemlig-assistant storybook
```

The local Storybook uses deterministic product fixtures for the shared viewer
components and the narrow To decide, Ready, alternatives, factual-detail,
unavailable, prepared-confirmation, verified-success, and empty presentations.
`pnpm --filter nemlig-assistant build:storybook`
checks that those stories build. It is a component visual contract, not an MCP
Apps host simulation or evidence of native ChatGPT rendering; retain the
built-viewer smoke and post-release host smoke for those boundaries.

Product disclosures, navigation and ordinary local edits do not fetch Nemlig;
adding new exact products hydrates only those products, and
explicit alternatives searches hydrate every unique eligible result in the
single provider response with three concurrent reads and bounded provider
deadlines/retries. This does not enumerate the whole catalogue.

When you are happy with Ready, choose **Review exact Nemlig change**.
This prepares fresh exact product prices and quantities and shows the separate
on-screen confirmation. Inspect the prepared lines, then choose **Add to Nemlig
basket** and confirm the exact addition in the viewer. In conversation, a clear instruction to add the
current Ready draft list is itself authorization for only those unchanged
prepared lines; if you only ask to prepare/inspect, or the intended products or
quantities are unclear or have changed, the assistant must ask before submitting.
Merely preparing or showing confirmation does not submit.
The quantities of those products are set in Nemlig; unrelated basket lines stay
unchanged and To decide items are excluded. Editing the draft invalidates
the pending submission. Verified success has its own screen; the local draft list
remains available for continued shopping. If the result is uncertain, inspect
the actual Nemlig basket before preparing another submission. There is no automatic retry.

Interactive ChatGPT hosts use their tool bridge. Other hosts retain the complete
structured/text results and equivalent conversational requests; the viewer never
pretends a local action succeeded when no bridge is available.

<a id="how-basket-changes-work"></a>
## 🛡️ How basket changes work

```text
Read → prepare the exact intended change → confirm user authorization → apply once → read back the basket
```

- Search and Nemlig basket inspection are read-only; they never authorize or
  change the Nemlig basket. Draft list edits are local only.
- Every real Nemlig basket change is a positive addition. It starts with
  an exact Ready submission prepared from the draft list.
- A clear instruction to add the unchanged Ready draft list authorizes only
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
  exact products, additional and resulting quantities, prices, totals, and the
  current basket fingerprint.
- The default 15-minute review window accommodates a normal ChatGPT approval
  round-trip without weakening final revalidation.
- Any changed fact invalidates the approval.
- The approved action freshly resolves every affected product upstream and
  revalidates the review and current basket state before writing.
- Additions re-read the basket immediately before writing and verify the
  resulting line quantities and basket totals afterward.
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
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant mcp
```

The MCP surface is organized around household actions:

- Find exact groceries with `find_groceries`.
- Verify the Nemlig account connection: `check_nemlig_connection` performs a
  bounded read-only provider check and reports missing credentials, provider
  reauthentication, or provider unavailability separately.
- See the actual Nemlig basket: `show_my_basket`.
- Show or build a local draft list: `start_product_review`; refresh, accept, change, remove,
  reconsider accepted products, append new products, navigate, finish shopping, or
  prepare submission with `update_product_review_conversation`. Show can recover the active
  conversation review without its opaque reference. Repeated starts preserve it.
- For a visual product request, search exact products and open the native Draft
  list without requiring the user to name a tool. This changes only local review
  state. Omit `items` to reopen an existing list, and add newly found products
  through `update_product_review_conversation`. If the user forbids local Draft
  state and later asks for a visual view, explain the conflict and ask whether
  to allow local state; give a concise text result until then.
  Use `show_my_basket` when the user means products already in Nemlig. Tool
  success alone does not prove that a client rendered the Draft list viewer.
- Submit those exact Ready lines after a clear conversational add instruction
  or the viewer's separate on-screen exact confirmation:
  `submit_product_review_conversation`.
  Ready acceptance alone is not provider-write authorization. The protected
  tool uses only the unchanged prepared lines; ambiguous scope or changed Ready
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
  current card is usable; repeat it only to reopen a stale card or when asked,
  since each call renders a new card and invalidates the previous card's actions.
  ChatGPT may retain older message cards in the conversation; Nemlig Assistant
  leaves that history to the host and makes superseded cards read-only.
  Each rendered view has a conversation-bound server token. The familiar
  Edits through `update_product_review` and `submit_product_review` require the newest
  view token. A stale card can omit it only for a read-only `show`; the explicit
  **Make this card current** action issues a new token without recreating a missing
  draft.
  Model-side text actions use the `_conversation` tool names. The MCP server
  serves a versioned viewer URI; older resource addresses are inert and cannot
  change shopping state.
  The viewer initializes the MCP Apps bridge and reports connection failures.
  It can edit the server-owned Draft list and call the protected submission path
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
Draft list's protected prepare/submit path, fresh validation and verified readback.
A clear request to add the current exact Ready draft list is its own
authorization; ambiguous or changed contents require approval of their exact
prepared change.

### Auth0 and hosted MCP

The maintained hosted path is the single-Container Cloudflare profile described
in [Cloudflare operations](../../docs/cloudflare-operations.md). It is the only
supported ChatGPT deployment. The CLI and stdio MCP server remain available for
direct local development and use; they are not a ChatGPT hosting fallback.

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
`pnpm --filter nemlig-assistant smoke:onboarding` and open its loopback URL.
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
3. Inspect the current Nemlig basket and confirm the Draft list remains distinct.
4. Start a Draft list, move exact products from To decide to Ready, and verify
   local edits leave the Nemlig basket unchanged.
5. Prepare an exact Ready addition and confirm that submission requires either
   a clear instruction to add those unchanged lines or approval of the exact
   prepared effect. Use fixtures for mutation tests; live basket changes need
   separate authorization.

<a id="development"></a>
## 🛠️ Development

```sh
pnpm --filter nemlig-assistant lint
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant check
pnpm --filter nemlig-assistant test
pnpm --filter nemlig-assistant smoke
pnpm --filter nemlig-assistant smoke:package
```

Tests use synthetic HTTP responses and never access a real Nemlig account.

The MCP resource uses the permanent `ui://nemlig/draft-list.html` identity and
serves the React viewer built into `dist/picker.html`. Existing cards are
handled separately by the viewer and every historical product-viewer URI is
inert. Do not use a new URI as a cache workaround; code delivery, resource
reads, and native rendering are recorded as separate evidence.
The package build includes that exact self-contained file and the browser smoke
drives it through a synthetic MCP host with a fake catalogue:

```sh
pnpm --filter nemlig-assistant bench:review-ui -- --runs 10
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant smoke:review-ui
```

Google Chrome must be installed. The report records its version so runs can be
compared against the same browser build.

The benchmark records raw/gzip size, first contentful paint, first product DOM
insertion (not paint), load milestones, and product-detail disclosure response
against synthetic product data in equivalent same-origin parent/iframe hosts.
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
4. Run `pnpm --filter nemlig-assistant check:api` and the package tests. The
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
pnpm --filter nemlig-assistant check:version-bump --base origin/main --head HEAD
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
- voice/touch To decide and Ready draft list with contextual alternatives,
  full-row alternative selection, and immediately scannable product comparisons
- persistent in-place review navigation, compact rows, and confirmed local removal
- complete-per-search alternative results, deliberate follow-up search, and conversation-only draft list edits
- explicit protected submission of resolved local products
- on-screen exact submission confirmation with conversational fallback
- CLI favorites, department browsing, and exact product details
- seven MCP tools for live profile/release identity, connection check, detailed
  search, actual basket read, Draft list start/update, and protected Ready
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
