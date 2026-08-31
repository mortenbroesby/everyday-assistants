# Nemlig Assistant

Unofficial local Node.js 22/TypeScript assistant for product discovery and
explicitly approved Nemlig basket changes. It is not affiliated with or
endorsed by nemlig.com. It contains no recipe or checkout capability.

## Feature sets

This is the maintained inventory of shipped, user-facing feature sets:

- **Account access:** interactive masked login, owner-only local credential
  storage, session reuse, and logout.
- **Product discovery:** Danish catalog search, authenticated favorite listing
  and search, deterministic candidate metadata, department listing, and
  paginated department browsing.
- **Favorites-first guided shopping:** structured multi-item plans, hard dietary
  and price constraints, preferences, catalog fallback, ambiguity-preserving
  candidate review, current basket coverage, remaining quantities, and selected
  total estimates.
- **Safe basket operations:** basket inspection plus exact prepare/approve/apply
  flows for additions, one-line removals, replacements, and clearing, with
  expiry, revalidation, single-use proposals, and automatic readback.
- **Replacement comparisons:** package, item-price, and unit-price review with
  factual signed basket-price differences and potential-savings wording.
- **Plan snapshots:** immutable owner-only saves containing structured inputs
  and selections, persisted locally or in the hosted EU storage object, with
  fresh product and basket resolution when loaded.
- **CLI and ChatGPT interfaces:** local CLI, conversational MCP tools, an
  optional MCP Apps picker, a private local tunnel runbook, and a disabled-by-
  default single-Container Cloudflare deployment profile with Auth0, quotas,
  rate limits, and manual/automatic circuit breakers.
- **Feature-request capture:** concise retry-safe GitHub issues created only when
  explicitly requested.
- **Private package delivery:** self-contained Node.js binaries, synthetic
  contract tests, smoke-tested tarballs, and guarded alpha release policy.

Keep this section current in the same change whenever a shipped feature set is
added, removed, or materially changed. List only implemented behavior here;
planned work belongs in [`BACKLOG.md`](BACKLOG.md) or an active OpenSpec change.

## Commands

Run from the Everyday Assistants repository root:

```sh
pnpm nemlig --help
pnpm nemlig login --save
pnpm nemlig search "mælk" --limit 5
pnpm nemlig favorites --limit 5
pnpm nemlig favorites --page 2 --limit 5
pnpm nemlig departments
pnpm nemlig browse /frugt-og-groent --page 1 --limit 20
pnpm nemlig cart
pnpm nemlig feature-request "Prefer discounted favorites" --summary "Choose discounted favorites first" --acceptance "Search favorites first" "Prefer discounted matches"
pnpm nemlig add 701015 --quantity 1
pnpm nemlig remove 701015
```

Run login yourself in a terminal. The CLI prompts for the password with masked
input and deliberately has no password command-line option. Saved credentials
remain in the legacy `~/.nemlig-shopper/credentials.json` location with
owner-only permissions so this rename does not log out existing installations;
environment variables take precedence when both `NEMLIG_USERNAME` and
`NEMLIG_PASSWORD` are present.

`feature-request` creates a concise issue in this repository through the
Keychain-backed GitHub CLI. Check access with `gh auth status -h github.com`;
no GitHub token belongs in this repository or its environment files.

## MCP server

Build and run the stdio server locally:

```sh
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant mcp
```

It exposes read-only `search_products`, `list_favorites`, `list_departments`,
`browse_department`, `plan_shopping_list`, `load_shopping_plan`, and `view_cart`, the
explicitly invoked `create_feature_request` GitHub issue tool, plus
proposal pairs for `cart_additions`, one-line `cart_removal`, and `cart_clear`.
The `cart_replacement` pair reviews one exact current line against one exact
replacement and its final quantity, including package details, current and
expected basket totals, and the signed price difference. A positive difference
is potential savings for those reviewed quantities, not a claim that the
products are equivalent.
`save_shopping_plan` creates an immutable owner-only local snapshot containing
only structured list inputs and selections. Loading re-resolves current products,
prices, availability, and basket coverage instead of trusting saved candidates.
Each pair is named `prepare_*` and `apply_*`; direct `add_to_cart`,
`remove_from_cart`, `replace_cart_line`, and `clear_cart` tools are intentionally
unavailable.
`pick_products` and `ui://nemlig/picker.html` are enabled by default; set
`NEMLIG_MCP_APPS=0` to keep only conversational tools. There is no order,
payment, purchase, or checkout tool.

### ChatGPT-first guided planning

Ask ChatGPT to turn a grocery list into 1–20 structured lines with quantities,
hard constraints, and optional preferences such as discounted, organic,
lowest unit price, or non-frozen. `plan_shopping_list` checks favorites first,
falls back to the catalog only for unmatched lines, and keeps multiple matches
unresolved for your choice. Results show source, dietary and discount metadata,
constraint outcomes, exact basket coverage, remaining quantities, and the
estimated total of selected remaining items.

The shared picker supports the whole plan with native selection and quantity
controls. It sends all selected positive remaining quantities to one exact
`prepare_cart_additions` review. The separate apply action still requires host
approval of that unchanged proposal; planning, selecting, saving, loading, and
preparing are never approval to change the basket.

### Owner alpha exercise

1. Log in locally, then plan a short list containing one favorite, one ambiguous
   item, and one constrained item. Confirm the ambiguous line stays unresolved.
2. List departments, browse a second page, and confirm deal/unit-price metadata.
3. Save the structured plan, load it again, and confirm it reflects current
   availability and basket quantities rather than stale saved prices.
4. Open the multi-line picker, adjust a choice and quantity, and inspect the one
   exact batch review. Stop there unless you separately want to approve that
   exact proposal; if so, use the host approval prompt and verify the basket
   readback. Record provider discrepancies as follow-up work rather than
   bypassing validation or the proposal boundary.
5. Conversationally prepare one cheaper and one non-cheaper replacement. Check
   both exact IDs, package and unit-price metadata, final replacement quantity,
   signed price difference, and expected basket total. Stop unless you
   separately approve one unchanged proposal. If you apply it, verify the new
   line is present and the old line is absent before continuing.

## Safety contract

- Search, favorites lookup, and basket inspection are read-only.
- Planning, department browsing, selection, snapshot save/load, and proposal
  preparation do not authorize a basket change.
- MCP clients first call the matching `prepare_*` tool. Preparation returns an
  exact, connection-bound proposal and never authorizes or performs a write.
- Before adding, show the exact product name and ID, package or size, quantity,
  price, and expected line total. Wait for explicit approval of that unchanged
  proposal, then call only its matching `apply_*` tool.
- Before removing one line, show its exact current product ID, name, quantity,
  and total and wait for explicit approval. The command removes only that line
  and verifies its product ID is absent; it does not clear the basket.
- Before replacing one line, show both exact product IDs and names, package and
  unit-price metadata, final replacement quantity, current and expected basket
  totals, signed price difference, and expiry. The apply step adds and verifies
  the replacement before removing the old line. If either readback is uncertain,
  inspect the basket and never retry the consumed proposal; both products may
  remain after a partial result.
- Before clearing, show the exact current basket and wait for explicit approval.
- Approval expires when any product, quantity, price, or total changes.
- Proposals are short-lived and single-use. Apply revalidates the connection,
  expiry, basket fingerprint, product identity, availability, quantity, price,
  and totals inside a process-local mutation lock.
- Every add, remove, replace, or clear call immediately reads back and displays or returns the
  basket. Stop after partial success, failed readback, or mismatch.
- Known completed replays return the stored sanitized result without another
  write. Indeterminate outcomes are never retried automatically.
- Never place an order, check out, or pay through this assistant.

Read [`AGENTS.md`](AGENTS.md) and the
[`nemlig-basket` skill](.codex/skills/nemlig-basket/SKILL.md) before operating
the app. Repository changes and specs never authorize a basket mutation.

For the private ChatGPT connection, follow
[`SECURE_MCP_TUNNEL.md`](SECURE_MCP_TUNNEL.md). The recommended alpha profile
uses Auth0 in front of a loopback-only HTTP MCP server while keeping Nemlig
credentials local. The existing stdio profile remains the rollback path.
Creating or changing Auth0 resources, the tunnel, runtime key, or ChatGPT app
remains an explicit owner action.

## Development

```sh
pnpm --filter nemlig-assistant lint
pnpm --filter nemlig-assistant build
pnpm --filter nemlig-assistant check
pnpm --filter nemlig-assistant test
pnpm --filter nemlig-assistant smoke
pnpm --filter nemlig-assistant smoke:package
```

Tests use synthetic HTTP responses and never access a real account.

## Private package and release policy

The private npm-format package is named `nemlig-assistant`. It is installable from
the tarball produced by `pnpm --filter nemlig-assistant smoke:package`, but it is
not claimed or published on npm. Its four binaries are `nemlig`,
`nemlig-assistant`, `nemlig-mcp`, and `nemlig-mcp-http`. Versions use
`major.minor.patch-alpha.increment`; the alpha increment never resets, including
across semantic-version changes. Nemlig runtime fixes require a patch, features
require a minor, and `!` or `BREAKING CHANGE:` requires a major. Tests and
release internals require only an increment. Other assistants, documentation,
OpenSpec, agent-rule, and workflow-only changes require no Nemlig release.

Inspect the current Git, tag, main, and npm decision without changing files:

```sh
pnpm nemlig:release:plan
```

Apply the reported version to only the Nemlig manifest after the same checks:

```sh
pnpm nemlig:release:apply
pnpm --filter nemlig-assistant check:version-bump --base origin/main
```

`Nemlig-Release: none` is the exact commit-body trailer for a reviewed runtime
change that must not publish. Ordinary documentation and unrelated changes are
already automatic no-ops and do not need the trailer.

### Publication is deferred

Publication is intentionally outside PR #8. The package manifest remains
`private: true`, the `NEMLIG_PUBLISH_ENABLED` repository variable must remain
absent or false, and the guarded main/retry jobs therefore skip without creating
a tag or contacting npm. No npm package claim, token, trusted publisher, GitHub
`npm` environment, provenance setup, repository-visibility change, or external
cost is part of this delivery.

Enabling publication requires a separate explicitly approved change that removes
the private package guard and verifies package naming, repository visibility,
workflow permissions, trusted-publisher binding, deployment protection, and the
exact packed artifact. The dormant retry path is not an activation shortcut.

Release work never authorizes Nemlig login, search, basket mutation, checkout,
order, or payment.

## Upstream parity baseline

The rewrite targets `mhattingpete/nemlig-shopper` commit
`65a681c1c5510ce03886ed16305b0a2d652c5be1`. Included: login/logout,
session setup, search and category fallback, product classification,
add/view/clear basket operations, CLI, MCP tools, candidate ranking, and the
optional picker. Recipe parsing and checkout/order/payment capabilities are
intentionally excluded.

## Layout

```text
.codex/skills/nemlig-basket/  Safe shopping workflow
src/client.ts                 Nemlig HTTP, search, and basket client
src/config.ts                 Local credential management
src/cli.ts                    CLI entry point
src/mcp.ts                    MCP server and picker resource
src/plans.ts                  Guided resolution and immutable local snapshots
src/proposals.ts              Proposal store, revalidation, and mutation lock
release/                      Version, transaction, and publication policy
scripts/smoke-package.ts      Installed-tarball interface proof
tsdown.config.ts              Two self-contained executable bundles
```
