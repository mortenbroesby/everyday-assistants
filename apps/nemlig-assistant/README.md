# Nemlig Assistant

<p align="center">
  Turn a grocery list into a safer, smarter Nemlig shopping plan.
</p>

<p align="center">
  Search, compare, plan, and review in conversation. Nothing changes your basket without explicit approval.
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
nemlig.com. It helps you move from “we need groceries” to a reviewed plan with
current products, prices, favorites, basket coverage, and exact quantities.

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
- “Plan bread, milk, apples, and pasta. Prefer favorites and discounted products.”
- “What is already in my basket, and what is still missing from this list?”
- “Save this shopping plan so I can continue later.”
- “Save this as a reusable list called Ugens basis.”
- “Make a separate birthday list, then show me both lists.”
- “Compare the cheese in my basket with this cheaper alternative.”
- “Add these selected products after showing me a clear summary.”

The first six examples are read-only or preparatory. The final example shows a
plain shopping summary and waits for approval before changing the basket.

<a id="what-you-can-do"></a>
## ✨ What you can do

### Discover products

- Translate or normalize ordinary product wording into one short Danish
  catalogue phrase before searching; preserve distinctive brands and include
  the Danish category (`Prince cookies` becomes `prince kiks`).
- List or search authenticated favorites.
- Browse departments with pagination.
- Compare product name, ID, package, price, unit price, discount, organic
  status, availability, and other known classifications.

### Plan a whole shopping list

- Turn 1–20 grocery lines into one structured plan.
- Search the current catalogue for every ordinary line using short, loose Danish wording.
- Apply hard constraints such as dietary, price, or frozen/non-frozen rules.
- Prefer discounted, organic, non-frozen, or lowest-unit-price candidates.
- Preserve ambiguity when several products could be right instead of guessing.
- Account for current basket quantities and show what remains to buy.
- Estimate the selected total from current product data.
- Use the optional visual picker to choose products and quantities.
- See direct Nemlig product images when the verified image host is available;
  every choice remains usable as text when an image is absent or fails.

### Save and continue later

- Create up to 25 private named lists, each with up to 50 ordered grocery lines.
- Keep regular household lists as `reusable` and event lists as `occasion`.
- Rename, replace, copy, archive, and restore lists with stale-edit protection.
- Open a list without contacting Nemlig, then explicitly refresh up to 20
  selected lines against the current catalogue, prices, availability, and basket coverage.
- Migrate an older saved-plan reference without deleting its source.
- Save immutable, owner-only plan snapshots.
- Store only structured inputs and selections, never credentials or stale
  product responses.
- Re-resolve current prices, availability, products, and basket coverage when a
  plan is loaded.
- Persist locally or through the hosted EU plan-storage object.

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
- Optionally expose the MCP Apps product picker.
- Capture a concise, retry-safe GitHub feature request when explicitly asked.

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

ChatGPT turns a grocery request into structured lines with quantities, hard
constraints, and optional preferences. It translates English or mixed wording,
normalizes misspellings, and shortens over-specific requests before
`plan_my_shopping` searches the current catalogue once per line. Distinctive
brands stay in the phrase while generic categories become Danish; uncertain
meaning is left for you to clarify. Favourites are searched only when you
explicitly ask.

The plan reports source, discount and dietary metadata, constraint outcomes,
exact basket coverage, remaining quantities, and the estimated total. The
visual picker can collect all selected remaining quantities into one exact
`review_items_to_add` review. Selection and review are not approval to add the
items.

<a id="how-basket-changes-work"></a>
## 🛡️ How basket changes work

```text
Read or plan → review the exact change → show a clear shopping summary → user approves → complete the action once → read back the basket
```

- Search, favourites, browsing, planning, picker selection, saved plans, and
  basket inspection are read-only. Named-list edits change only private
  assistant state; they never authorize or change the Nemlig basket.
- Every basket change starts with the matching `review_*` tool.
- Approval is requested once. A prior approval counts when it explicitly covers
  every exact detail in the unchanged review; otherwise the full review is
  shown before asking.
- Ordinary summaries show names, quantities, useful package distinctions, and
  prices without internal IDs, expiry times, or protocol status fields. Ask for
  “technical details” when those internals are useful for troubleshooting.
- A review is connection-bound, short-lived, single-use, and tied to exact
  products, quantities, prices, totals, and the current basket fingerprint.
- The default 15-minute review window accommodates a normal ChatGPT approval
  round-trip without weakening final revalidation.
- Any changed fact invalidates the approval.
- The approved action revalidates the review and current state before writing.
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

### Local MCP server

```sh
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant mcp
```

The MCP surface is organized around household actions:

- Find groceries and favourites: `find_groceries`, `show_my_favorites`,
  `show_grocery_sections`, and `browse_grocery_section`.
- Plan and continue shopping: `plan_my_shopping`, `save_my_shopping_plan`, and
  `continue_my_shopping_plan`.
- Keep named lists: `show_my_shopping_lists`, `save_my_shopping_list`,
  `copy_my_shopping_list`, `set_my_shopping_list_status`, `shop_from_my_list`,
  and `migrate_my_saved_plan`.
- See the basket: `show_my_basket`.
- Review basket changes: `review_items_to_add`, `review_item_to_remove`,
  `review_item_swap`, and `review_emptying_basket`.
- Complete an approved change: `add_approved_items`, `remove_approved_item`,
  `make_approved_item_swap`, and `empty_approved_basket`.
- Choose visually: `choose_products_visually` and `ui://nemlig/picker.html`.
- Suggest an improvement: `suggest_an_improvement`.

After an ordinary release, open the existing app named exactly `Nemlig Assistant`
and use **Refresh** so ChatGPT rediscovers tools, schemas, instructions,
resources, and picker changes. Never create `Nemlig Assistant (new)`, a
bracketed or numbered variant, or a parallel copy for a normal release.

Direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, and
`clear_cart` MCP tools intentionally do not exist. Set `NEMLIG_MCP_APPS=0` to
disable only the visual picker while keeping conversational tools.

### Auth0 and hosted MCP

The maintained hosted path is the single-Container Cloudflare profile described
in [Cloudflare operations](../../docs/cloudflare-operations.md). It is the only
supported ChatGPT deployment. The CLI and stdio MCP server remain available for
direct local development and use; they are not a ChatGPT hosting fallback.

The MCP server advertises the original orange bitten-dot icon and the display
name `Nemlig Assistant` to clients that render standard MCP app metadata.

Creating or changing identity, hosting, DNS, runtime secrets, or paid resources
is an owner-controlled infrastructure action. Nemlig credentials must stay out
of the repository.

### Feature requests

```sh
pnpm nemlig feature-request "Prefer discounted favorites" \
  --summary "Choose discounted favorites first" \
  --acceptance "Search favorites first" "Prefer discounted matches"
```

This uses the Keychain-backed GitHub CLI and creates an issue only when
explicitly requested. Verify access with `gh auth status -h github.com`; never
put a GitHub token in the repository or an environment file.

## 🧪 Owner alpha exercise

1. Ask for a short plan containing one favorite, one ambiguous item, and one
   constrained item. Confirm the ambiguous line stays unresolved.
2. Browse a department's second page and inspect deal and unit-price metadata.
3. Save and reload the plan. Confirm it resolves current availability, prices,
   and basket quantities rather than replaying stale data.
4. Create `Ugens basis`, reopen it without a Nemlig lookup, refresh selected
   lines, then archive and restore it. Confirm reusable does not mean automatic.
5. Use the picker, adjust a selection, and inspect the exact batch review.
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

The private npm-format package is named `nemlig-assistant`; it is installable
from the smoke-tested tarball but remains `private: true` and unpublished. Its
binaries are `nemlig`, `nemlig-assistant`, `nemlig-mcp`, and
`nemlig-mcp-http`. Publication requires a separate approved change and is not a
deployment shortcut.

Inspect or apply the repository's alpha version decision with:

```sh
pnpm nemlig:release:plan
pnpm nemlig:release:apply
pnpm --filter nemlig-assistant check:version-bump --base origin/main
```

Nemlig runtime fixes require a patch, features a minor, and breaking changes a
major; the monotonic `-alpha.N` counter never resets. `Nemlig-Release: none` is
the exact commit-body trailer for a reviewed runtime change that must not
publish. Documentation and unrelated changes are already release no-ops.

## 📋 Maintained feature inventory

This README is the user-facing inventory of shipped feature sets:

- account access
- product and department discovery
- catalogue-first guided shopping with explicit favourite browsing
- constrained product comparison and selection
- basket-aware whole-list planning
- private saved shopping plans that refresh current product data
- exact review/approve/complete basket operations
- easy-to-understand ChatGPT tool names and descriptions
- human-friendly basket reviews and verified results
- replacement and savings review
- CLI, MCP, MCP Apps, Auth0, and bounded Cloudflare hosting
- credential-free production-readiness gate
- explicit improvement suggestions
- private package and guarded alpha release policy

Update this inventory and the relevant section above whenever a shipped feature
set is added, removed, or materially changed. Planned work belongs in
[`BACKLOG.md`](BACKLOG.md) or an active OpenSpec change.

## 🗂️ Project map

```text
.codex/skills/nemlig-basket/  Safe shopping workflow
.codex/skills/nemlig-production/  Production-readiness workflow
src/client.ts                 Nemlig HTTP, search, and basket client
src/config.ts                 Local credential management
src/cli.ts                    CLI entry point
src/mcp.ts                    MCP server and picker resource
src/http.ts                   Authenticated HTTP MCP transport
src/cloudflare-worker.ts      Gateway, Container, and Durable Objects
src/plans.ts                  Guided resolution and plan snapshots
src/proposals.ts              Proposal store, revalidation, and mutation lock
release/                      Version and publication policy
scripts/smoke-package.ts      Installed-package interface proof
```

## Upstream baseline

The rewrite targets `mhattingpete/nemlig-shopper` commit
`65a681c1c5510ce03886ed16305b0a2d652c5be1`. Login/logout, session setup,
search, category fallback, product classification, basket operations, CLI, MCP,
ranking, and the optional picker are included. Recipe parsing and all
checkout/order/payment capabilities are intentionally excluded.
