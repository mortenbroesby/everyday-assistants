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

### Build a proposed shopping basket

- Search each ingredient separately with one- or two-word Danish catalogue terms.
- Refine empty or unsuitable searches without a fixed product-level attempt count.
- Show one recommended product per ingredient with package quantity and an
  evidence-based match-confidence judgment.
- Consult existing favourites when match confidence is below 80%.
- Keep alternatives collapsed at or above 80% and expand them below 80%.
- Present actionable visual choices in groups of at most five and show the
  complete proposed basket before asking to add anything.
- State omitted pantry assumptions such as flour, salt, and pepper.
- Apply hard constraints such as dietary, price, or frozen/non-frozen rules.
- Preserve requested weights, volumes, or counts and compare the package combinations needed to cover them.
- Treat catalogue results as options rather than assuming every result suits the ingredient.
- See direct Nemlig product images when the verified image host is available;
  every choice remains usable as text when an image is absent or fails.
- Use the basket-aware `plan_my_shopping` only when explicitly requesting the
  legacy batch-planning behavior.

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
- Optionally expose the MCP Apps proposed-basket review.

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
It can refine an empty or unsuitable result, then recommends one current product
from the available evidence. Below 80% match confidence it checks favourites and
opens useful alternatives automatically. Higher-confidence alternatives stay
collapsed.

The read-only proposed-basket view reports package size, quantity, product
description, price, unit price, confidence, and current alternatives. Choices
are handled in groups of at most five. A mismatched or vanished catalogue item
is identified without hiding the other valid choices or failing the whole group.
Planning does not inspect the current basket; after choices settle, ChatGPT shows the complete proposed basket before
preparing the separate exact basket-addition review.

Provider descriptions and item details are converted from HTML to bounded plain
text, including Danish characters and entities. Scripts, styles, images and link
destinations are omitted; conversion does not fetch additional resources.
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

### Local MCP server

```sh
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant mcp
```

The MCP surface is organized around household actions:

- Find groceries and favourites: `find_groceries`, `show_my_favorites`,
  `show_grocery_sections`, and `browse_grocery_section`.
- Review proposed groceries without reading or changing the basket:
  `review_proposed_basket`.
- Use basket-aware batch planning explicitly when needed: `plan_my_shopping`.
- Check the connection: `check_nemlig_connection`.
- See the basket: `show_my_basket`.
- Review basket changes: `review_items_to_add`, `review_item_to_remove`,
  `review_item_swap`, and `review_emptying_basket`.
- Complete an approved change: `add_approved_items`, `remove_approved_item`,
  `make_approved_item_swap`, and `empty_approved_basket`.
- Review proposed groups with `review_proposed_basket`, which uses
  `ui://nemlig/picker.html`. Raw catalogue searches remain conversational so
  unrelated search results cannot appear as selectable proposal choices.

After an ordinary release, open the existing app named exactly `Nemlig Assistant`
and use **Refresh** so ChatGPT rediscovers tools, schemas, instructions,
resources, and picker changes. Never create `Nemlig Assistant (new)`, a
bracketed or numbered variant, or a parallel copy for a normal release.

Direct `add_to_cart`, `remove_from_cart`, `replace_cart_line`, and
`clear_cart` MCP tools intentionally do not exist. Set `NEMLIG_MCP_APPS=0` to
disable the visual proposed-basket review while keeping conversational tools.

### Auth0 and hosted MCP

The maintained hosted path is the single-Container Cloudflare profile described
in [Cloudflare operations](../../docs/cloudflare-operations.md). It is the only
supported ChatGPT deployment. The CLI and stdio MCP server remain available for
direct local development and use; they are not a ChatGPT hosting fallback.

Hosted identity is resolved from the validated Auth0 subject. Schema v2 keeps
the static Tier 0 owner and tier budgets in the encrypted
`NEMLIG_MCP_PRINCIPALS` policy while accepted native Auth0 Organization
invitations create bounded Tier 1 records in the existing controller. Each user
has independent sealed credentials, sessions and basket proposals; unknown or disabled identities are rejected before Container
wake. Tier labels remain for identity and reporting, but all three tiers use
the same per-principal allowances without reserved capacity or ordered
shedding. The global kill switch, breaker, quotas, deadlines, and one-Container
ceiling still override every tier.

When onboarding is enabled by the operator, use `check_nemlig_connection` or
open `https://nemlig-mcp.broesby.dk/connect` and enter only your own Nemlig login
in that separately authenticated page. Never send it through ChatGPT or a tool
argument. The page can replace or revoke your connection; the owner can disable
or revoke invitee access. Follow the disabled-first
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

The private npm-format package is named `nemlig-assistant`; it is installable
from the smoke-tested tarball but remains `private: true` and unpublished. Its
binaries are `nemlig`, `nemlig-assistant`, `nemlig-mcp`, and
`nemlig-mcp-http`. Publication requires a separate approved change and is not a
deployment shortcut.

Inspect or apply the repository's alpha version decision with:

```sh
pnpm nemlig:release:plan
pnpm nemlig:release:apply
pnpm --filter nemlig-assistant check:version-bump --base origin/main --head HEAD
```

The version check compares committed revisions, not uncommitted manifest edits.
CI checks the entire main push from its previous SHA, or the PR merge base through
the tested SHA; missing or invalid comparison revisions fail closed.

Nemlig runtime fixes require a patch, features a minor, and breaking changes a
major; the monotonic `-alpha.N` counter never resets. `Nemlig-Release: none` is
the exact commit-body trailer for a reviewed runtime change that must not
publish. Documentation and unrelated changes are already release no-ops.

## 📋 Maintained feature inventory

This README is the user-facing inventory of shipped feature sets:

- account access
- product and department discovery
- fresh Nemlig authentication before every provider-backed MCP task
- individual short-query ingredient discovery and refinement
- favourites as read-only evidence for uncertain matches
- confidence-aware grouped proposed-basket review
- constrained product comparison and selection, with legacy batch planning
- exact review/approve/complete basket operations
- easy-to-understand ChatGPT tool names and descriptions
- human-friendly basket reviews and verified results
- replacement and savings review
- CLI, MCP, MCP Apps, Auth0, and bounded Cloudflare hosting
- credential-free production-readiness gate
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
src/plans.ts                  Request-scoped guided resolution
src/proposals.ts              Proposal store, revalidation, and mutation lock
release/                      Version and publication policy
scripts/smoke-package.ts      Installed-package interface proof
```

## Upstream baseline

The rewrite targets `mhattingpete/nemlig-shopper` commit
`65a681c1c5510ce03886ed16305b0a2d652c5be1`. Login/logout, session setup,
search, category fallback, product classification, basket operations, CLI, MCP,
ranking, and the optional proposed-basket review are included. Recipe parsing and all
checkout/order/payment capabilities are intentionally excluded.
