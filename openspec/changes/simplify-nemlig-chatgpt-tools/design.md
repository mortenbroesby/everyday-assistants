## Context

See `proposal.md` for motivation. The server currently registers 18 tools directly in `src/mcp.ts`; titles are partly friendly, but the identifiers, descriptions, and input keys mix shopping language with protocol details. The Worker gateway, picker, interface tests, and production acceptance workflow refer to those identifiers. Existing basket safety depends on distinct review and action calls, so presentation must improve without combining those calls.

## Goals / Non-Goals

**Goals:**

- Replace the advertised catalog in one coordinated migration.
- Make the tool list and schemas readable before a tool is invoked.
- Preserve internal proposal storage and every current safety and cost control.

**Non-Goals:**

- Preserve obsolete names through aliases.
- Create a general tool-definition framework or add a dependency.
- Change structured tool results, selection logic, persistence, authentication, hosting, or external state.

## Decisions

### Rename the advertised tools once

Use this mapping:

| Current identifier | New identifier | Display title |
| --- | --- | --- |
| `search_products` | `find_groceries` | Find groceries |
| `list_favorites` | `show_my_favorites` | Show my favourites |
| `plan_shopping_list` | `plan_my_shopping` | Plan my shopping |
| `list_departments` | `show_grocery_sections` | Show grocery sections |
| `browse_department` | `browse_grocery_section` | Browse a grocery section |
| `save_shopping_plan` | `save_my_shopping_plan` | Save my shopping plan |
| `load_shopping_plan` | `continue_my_shopping_plan` | Continue my shopping plan |
| `create_feature_request` | `suggest_an_improvement` | Suggest an improvement |
| `view_cart` | `show_my_basket` | Show my basket |
| `prepare_cart_additions` | `review_items_to_add` | Review items to add |
| `apply_cart_additions` | `add_approved_items` | Add the approved items |
| `prepare_cart_removal` | `review_item_to_remove` | Review an item to remove |
| `apply_cart_removal` | `remove_approved_item` | Remove the approved item |
| `prepare_cart_replacement` | `review_item_swap` | Review swapping an item |
| `apply_cart_replacement` | `make_approved_item_swap` | Make the approved swap |
| `prepare_cart_clear` | `review_emptying_basket` | Review emptying my basket |
| `apply_cart_clear` | `empty_approved_basket` | Empty my approved basket |
| `pick_products` | `choose_products_visually` | Choose products visually |

Do not advertise aliases. This repository is still alpha with one owner, and aliases would double the visible catalog and undermine the change. Alternative considered: change titles only. Rejected because clients may display raw identifiers in tool details, which is the reported problem.

### Keep protocol internals behind the advertised boundary

Internal proposal types, storage, fingerprints, and structured result fields remain unchanged. Rename exposed input keys only where the old key itself is visible and cryptic, and attach plain Zod descriptions to non-obvious inputs. In particular, action tools should advertise an `approved_review` reference while mapping it internally to the existing proposal ID; product and section references should explain that they come from a preceding search, basket, or section result.

Alternative considered: rename internal proposal concepts throughout the codebase. Rejected because it increases the diff without improving the ChatGPT catalog.

### Update direct consumers without adding a registry abstraction

Update the Worker expensive-operation classification, picker tool calls, production acceptance inventory, server instructions, and tests at their existing call sites. Add one table-driven catalog assertion through `listTools()` for the complete expected name/title/description/annotation surface. A new runtime registry or compatibility layer is unnecessary for a fixed set of 18 tools.

### Use outcome-first descriptions

Each description should answer, in order: what happens, whether the basket or another system changes, and when the tool is appropriate. Ordinary wording must avoid `proposal`, `apply`, `immutable snapshot`, UUID, expiry, and internal statuses. Technical details remain available in structured responses and sanitized troubleshooting.

## Risks / Trade-offs

- [Cached clients call obsolete names] -> Deploy once, update the production acceptance inventory, and instruct the owner to refresh or reconnect the ChatGPT app.
- [Renaming misses a direct consumer] -> Search all old identifiers and make the catalog inventory test plus production acceptance fail on drift.
- [Friendly wording obscures mutation] -> Require every write-capable description and annotation to state its effect explicitly.
- [Input renaming breaks the picker] -> Update picker calls in the same commit and cover them with existing interface tests.
- [Catalog change increases cost] -> No new calls, retries, services, storage, or scaling; retain gateway classification and all current limits unchanged.

## Migration Plan

1. Rename registrations, exposed input keys, server guidance, and all direct consumers in one repository change.
2. Update catalog, interface, gateway, picker, package-smoke, and production-acceptance tests.
3. Update the README feature inventory and add the client refresh/reconnection note.
4. Run the full production-readiness gate without deploying or mutating a basket.
5. In a separately authorized deployment, release the server and refresh or reconnect the ChatGPT app.
6. Roll back to the previous deployment if clients cannot refresh; do not add aliases as an emergency compatibility layer.
