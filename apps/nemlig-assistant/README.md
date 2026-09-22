# Nemlig Assistant

<p align="center">
  Turn a grocery list into a safer, smarter Nemlig shopping plan.
</p>

<p align="center">
  Search, compare, plan, and shop in conversation. Nothing changes your basket without explicit approval, including a clear same-run “go ahead.”
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
with current products, prices, favourites, and exact quantities.

Use it from a terminal or connect its MCP server to an AI client such as
ChatGPT. The assistant can do useful read-only work immediately. Basket writes
are deliberately split into prepare, approve, and apply steps.

It has no recipe, order, payment, or checkout capability. It is not affiliated
with or endorsed by nemlig.com or OpenAI.

<a id="start-here"></a>
## 🚀 Start here

Once connected, try prompts like:

- “Show five of my favorite products.”
- “Find organic milk and compare the best options by unit price.”
- “Find the ingredients for burgers and lasagna, then show me the proposed basket.”
- “For uncertain choices, check whether I already have a suitable favourite.”
- “Show one recommendation per ingredient and expand alternatives below 80% match confidence.”
- “Compare the cheese in my basket with this cheaper alternative.”
- “Add these selected products after showing me a clear summary.”
- “Which Nemlig Assistant version and codename are running?”

The “go ahead” example uses automatic mode and adds only deterministic clear
matches. Requests without that explicit proceed intent remain read-only or
preparatory, and exact reviews still wait for approval.

<a id="what-you-can-do"></a>
## ✨ What you can do

### Discover products

- Translate or normalize ordinary product wording into one short Danish
  catalogue phrase before searching; preserve distinctive brands and include
  the Danish category (`Prince cookies` becomes `prince kiks`).
- List or search authenticated favorites.
- Browse departments with pagination.
- Compare product name, ID, package, price, unit price, discount, organic
  status, availability, product description, item details, and other known
  classifications when Nemlig supplies them.

### Plan shopping without hidden state

- Use `plan_my_shopping` for request-scoped planning of up to fifty grocery lines.
- Use `find_groceries` for direct current catalogue searches and
  `get_grocery_details` for one exact product returned by search or planning.
- Consult authenticated favourites when the user asks for them or when planning
  needs bounded read-only evidence.
- Preserve package, price, availability, dietary, and supplied product-detail
  evidence as structured data with a readable text fallback.
- Keep product images optional and accept only the observed HTTPS Nemlig origins;
  text details remain available when an image is absent or rejected.

### Review the basket safely

- Inspect the current basket without changing it.
- Prepare an exact batch of additions.
- Prepare removal of one exact basket line.
- Compare and prepare replacement of one exact line with one exact product.
- Prepare clearing the basket.
- Review signed basket-price differences and potential savings for the exact
  quantities under consideration.

### Use the interface that fits

- Run a local CLI for direct terminal workflows.
- Use the stdio MCP server with a local MCP client.
- Use the HTTP MCP server behind Auth0.
- Connect ChatGPT to the private hosted Cloudflare deployment.
  - Keep catalogue discovery and exact product details conversational; no custom
  MCP UI resource is required.

### Hosted family alpha

The production profile is designed for private, low-volume family use:

- Auth0 authenticates before useful requests reach the backend.
- One fixed Cloudflare Container can sleep when idle and cannot horizontally autoscale.
- Per-user rate limits and daily normal/expensive quotas bound usage.
- An automatic circuit breaker fails closed when a quota is exceeded.
- `MCP_ENABLED` provides an immediate manual kill switch.
- Explicit timeouts and bounded retries prevent failed work from running forever.

See [Cloudflare hosting assessment](../../docs/cloudflare-hosting-assessment.md)
and [Cloudflare operations](../../docs/cloudflare-operations.md) for the
architecture, cost controls, deployment, rollback, and emergency procedures.
Use the [production-readiness gate](../../docs/nemlig-production-readiness.md)
for one repeatable credential-free repository and CI check.

## 🧭 How guided shopping works

ChatGPT searches each ingredient separately with short Danish catalogue terms.
It can refine an empty or unsuitable result, then recommends current products
from the available evidence. Exact product details remain a separate read-only
lookup, and basket changes stay behind the existing exact review/apply flow.

Provider descriptions, declarations, and item details are converted from HTML
to bounded plain text, including Danish characters and entities. Scripts,
styles, images and link destinations are omitted; conversion does not fetch
additional resources.
Plan tool outputs publish explicit nested schemas while preserving optional
product evidence. Supply groceries in the current conversation; the assistant
does not save or reload plans or named lists.

<a id="how-basket-changes-work"></a>
## 🛡️ How basket changes work

```text
Read or plan → resolve only clear matches → bind explicit proceed or exact approval → complete once → read back the basket
```

- Search, favourites, browsing, proposed-basket review and basket inspection
  are read-only; they never authorize or change the Nemlig basket.
- Every basket change starts with the matching `review_*` tool.
- Approval is requested once. “Go ahead” may authorize only clear additions
  resolved from that same run; unresolved lines remain unchanged. Removals,
  replacements, and clearing always require their own exact approval.
- Ordinary summaries show names, quantities, useful package distinctions, and
  prices without internal IDs, expiry times, or protocol status fields. Ask for
  “technical details” when those internals are useful for troubleshooting.
- A review is connection-bound, short-lived, single-use, and tied to exact
  products, quantities, prices, totals, and the current basket fingerprint.
- The default 15-minute review window accommodates a normal ChatGPT approval
  round-trip without weakening final revalidation.
- Any changed fact invalidates the approval.
- The approved action freshly resolves every affected product upstream and
  revalidates the review and current basket state before writing.
- Add, remove, replace, and clear immediately read the basket back.
- Writes are never automatically retried after an uncertain result.
- Replacement adds and verifies the new line before removing the old one. If
  verification becomes uncertain, the workflow stops because both may remain.
- Repeated completed actions return the stored sanitized result without writing again.
- The assistant never orders, checks out, or pays.

Repository work, a specification, a plan, product selection, or review
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
pnpm nemlig remove 701015
```

They remain subject to the exact-product approval and readback contract above.

### Local plan command

`plan` resolves a strict JSON file with one to fifty shopping lines using the
same planner as `plan_my_shopping`. It reads the current catalogue and basket to
calculate coverage, but it never creates a proposal or calls a basket mutation
method.

```json
{
  "lines": [
    { "id": "milk", "name": "mælk", "quantity": 2 },
    { "id": "coffee", "name": "kaffe", "quantity": 1 }
  ]
}
```

```sh
pnpm nemlig plan ./shopping.json --timeout-ms 30000
pnpm nemlig plan ./shopping.json --json
```

The file is parsed and validated before login or any provider request. Press
`Ctrl-C` to cancel; the command waits for its active reads to finish unwinding.

The credential-free acceptance below starts a real HTTP server on `127.0.0.1`,
drives this CLI command with real Node fetch, and proves success, cancellation,
socket closure, and fatal-failure quiescence outside ChatGPT:

```sh
pnpm --filter nemlig-assistant demo:product-discovery
```

Account-backed acceptance is intentionally not performed: the current Nemlig
login request can ask the provider to merge a pre-login basket. The command's
planner never invokes a basket mutation, but an authenticated terminal run
still inherits that login behavior until it is separately redesigned.

### Local MCP server

```sh
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant mcp
```

The MCP surface is organized around household actions:

- Find groceries, favourites, sections, and exact product details with
  `find_groceries`, `show_my_favorites`, `show_grocery_sections`,
  `browse_grocery_section`, and `get_grocery_details`.
- Use basket-aware batch planning explicitly when needed: `plan_my_shopping`.
- Verify the Nemlig account connection: `check_nemlig_connection` performs a
  bounded read-only provider check and reports missing credentials, provider
  reauthentication, or provider unavailability separately.
- Reopen ChatGPT authorization after an expired or disabled app connection:
  `reconnect_nemlig_assistant`.
- See the basket: `show_my_basket`.
- Review basket changes: `review_items_to_add`, `review_item_to_remove`,
  `review_item_swap`, and `review_emptying_basket`.
- Complete an approved change: `add_approved_items`, `remove_approved_item`,
  `make_approved_item_swap`, and `empty_approved_basket`.
- Exact product details are read-only and returned as structured catalogue data;
  there is no custom picker or MCP UI resource. Raw catalogue searches remain
  conversational so unrelated search results cannot appear as selectable basket choices.

After an ordinary release, open the existing app named exactly `Nemlig Assistant`
and use **Refresh** so ChatGPT rediscovers tools, schemas, instructions,
resources and instruction changes. Never create `Nemlig Assistant (new)`, a
bracketed or numbered variant, or a parallel copy for a normal release.
Use ChatGPT's **Reconnect** setting or the `Reconnect Nemlig Assistant` action
when authorization has expired; invalid tokens also trigger that prompt
automatically.

Direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, and
`clear_cart` MCP tools intentionally do not exist. Basket changes continue to
require the matching staged review/apply tools and explicit approval.

### Auth0 and hosted MCP

The maintained hosted path is the single-Container Cloudflare profile described
in [Cloudflare operations](../../docs/cloudflare-operations.md). It is the only
supported ChatGPT deployment. The CLI and stdio MCP server remain available for
direct local development and use; they are not a ChatGPT hosting fallback.

Hosted identity is resolved from the validated Auth0 subject. Schema v2 keeps
the static Tier 0 owner and tier budgets in the encrypted
`NEMLIG_MCP_PRINCIPALS` policy while legacy invitation records remain a separate
capability; this application no longer performs that Auth0 flow. Each user
has independent sealed credentials, sessions and basket proposals; unknown or disabled identities are rejected before Container
wake. Tier labels remain for identity and reporting, but all three tiers use
the same per-principal allowances without reserved capacity or ordered
shedding. The global kill switch, breaker, quotas, deadlines, and one-Container
ceiling still override every tier.

The authenticated `get_profile` tool is provider-independent: Auth0 validation,
principal authorization, MCP initialization, and profile discovery do not need a
Nemlig login. Provider-backed tools remain credential-gated and return the
existing connection-required result until a Nemlig connection is provisioned.

When the provider portal is enabled by the operator, it accepts a standard
resource bearer token and then uses a short-lived signed portal cookie. Enter
only your own Nemlig login in that separately authenticated page. Never send it
through ChatGPT or a tool argument. The page can replace or revoke your
connection; the owner can disable or revoke invitee access. Follow the disabled-first
[self-service procedure](../../docs/cloudflare-operations.md#self-service-credential-onboarding).

The MCP server advertises the original orange bitten-dot icon and the display
name `Nemlig Assistant` to clients that render standard MCP app metadata.

Creating or changing identity, hosting, DNS, runtime secrets, or paid resources
is an owner-controlled infrastructure action. Nemlig credentials must stay out
of the repository.

## 🧪 Owner alpha exercise

1. Ask for a recipe proposal containing one favourite, one ambiguous item, and
   one constrained item. Confirm each ingredient uses a short individual search.
2. Confirm alternatives expand below 80% match confidence and remain collapsed
   at or above 80%.
3. Browse a department's second page and inspect deal and unit-price metadata.
4. Review the complete proposed basket and its stated pantry assumptions without
   reading or changing the current basket.
5. Adjust a selection, then inspect the separate exact batch review.
   Stop unless you separately approve that unchanged review.
6. Prepare one cheaper and one non-cheaper replacement. Verify both product
   IDs, packages, unit prices, final quantity, signed price difference, and
   expected basket total before considering approval.

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
- individual short-query ingredient discovery and refinement
- favourites as read-only evidence for uncertain matches
- composable catalogue search, favourites, sections, browsing, and exact details
- request-scoped planning with bounded product evidence
- constrained product comparison and selection, with staged basket review/apply
- exact review/approve/complete basket operations
- easy-to-understand ChatGPT tool names and descriptions
- human-friendly basket reviews and verified results
- replacement and savings review
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
src/plans.ts                  Request-scoped guided resolution
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
