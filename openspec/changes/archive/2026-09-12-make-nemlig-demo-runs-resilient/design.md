## Context

Recent recipe runs showed that the batch planner is the wrong default interaction. It left ordinary ingredients unresolved, while short individual searches found usable products. The existing visual picker then moved too quickly toward adding one product and did not show the family the complete proposed shop.

The useful primitives already exist: bounded product search, product metadata, read-only favourites, exact proposal review, same-run authorization, and verified basket readback. This change composes those primitives into a clearer conversational flow without adding storage, a recommendation service, or an unbounded server loop.

## Goals / Non-Goals

**Goals:**

- Make short, individual product searches the normal recipe workflow.
- Show one proposed product per ingredient, with evidence and an honest model-supplied match-confidence score.
- Consult existing favourites when a match remains uncertain.
- Let the user review the whole proposed basket and resolve meaningful alternatives in groups of at most five.
- Preserve the existing exact approval and mutation safety boundary.
- Prove the flow with a deterministic recipe-scale smoke scenario.

**Non-Goals:**

- A statistical confidence model, learned recommender, or perfect catalogue classifier.
- Cloudflare preference, pantry, or shopping-list storage.
- Favourite mutation in this change.
- Removing `plan_my_shopping` compatibility.
- Checkout, payment, ordering, or delivery changes.

## Decisions

### Use individual searches as the default orchestration

ChatGPT will call `find_groceries` separately for each ingredient, starting with a one- or two-word Danish term and refining when results are empty or unsuitable. There is no product-level attempt counter. Every tool call remains bounded by the existing request deadline, quota, circuit breaker, kill switch, and single-Container ceiling.

`plan_my_shopping` remains available for explicit batch use and compatibility, but instructions no longer require it before ordinary recipe shopping. The individual flow does not inspect or subtract the current basket.

### Keep recommendation reasoning in ChatGPT

The server returns current catalogue evidence and validates proposed confidence as an integer from 0 to 100. ChatGPT chooses the recommended product, package quantity, confidence, and alternatives from that evidence. Confidence is labelled as match confidence, not a measured probability.

The server will reject unknown product identifiers and malformed proposals. It will not invent a category model. Existing relevance and constraint evidence remains available so ChatGPT can avoid proposing obviously unsuitable products even when an unrelated product appears in search results.

### Coalesce overlapping pre-authentication

Every provider-backed task still performs fresh pre-authentication. When ChatGPT starts independent searches in parallel for the same principal, overlapping tasks share the same in-flight login instead of mutating the shared Nemlig session concurrently. Sequential tasks continue to authenticate freshly, and a later HTTP 401 still triggers one fresh login and one read retry.

### Use favourites only as extra evidence for uncertainty

When confidence is below 80%, ChatGPT checks `show_my_favorites` and may prefer a favourite that fits the requested ingredient. Favourites never override an incompatible product type or explicit requirement. No preference copy is stored by the assistant.

Add/remove favourite tools are deferred until the provider endpoint, authorization boundary, and readback semantics are verified. That follow-up will require explicit user approval for every mutation and may offer a dedicated favouriting session.

### Extend the existing MCP App into a read-only proposed-basket review

A proposed-basket tool accepts at most five actionable entries per view. Each entry contains the requested ingredient, one chosen product, requested quantity, match confidence, and bounded alternatives. The server resolves current product metadata and returns image, description, package size, price, and unit price.

The view expands alternatives automatically below 80% confidence and otherwise keeps them collapsed. For fewer than twenty products, ChatGPT may show the entire proposal as consecutive groups of at most five. For larger shops, confident selections stay compact and only uncertain decisions require grouped interaction.

Selecting an alternative sends the choice back to the conversation through the existing MCP Apps message channel. The view does not call basket mutation tools and stores no draft state. After all choices are settled, ChatGPT shows the complete proposed basket once more.

### Keep basket inspection inside the approved mutation boundary

Recipe planning and proposed-basket review neither show nor use current basket contents. Once the user explicitly approves the final additions, the existing `review_items_to_add` and `add_approved_items` flow may read the basket internally for its fingerprint, exact authorization, drift detection, single-attempt write, and final readback. It does not use current basket contents to decide what the user intended to shop for.

### Reuse the existing smoke harness

The existing credentials-free MCP smoke path will cover a mixed recipe scenario derived from recent cake, burger, and lasagna runs. It will prove short searches, an uncertain favourite, an incompatible search result that is not proposed, package quantity, grouped review, authorization rejection on drift, apply, and final readback without contacting Nemlig.

## Risks / Trade-offs

- [More individual searches increase read-only calls] → Preserve current quotas and infrastructure limits; do not add retries inside the server.
- [Parallel searches can overlap provider login] → Share only the in-flight login per client; keep product reads independent and retain the existing bounded retry.
- [Model-supplied confidence can look more precise than it is] → Label it as a match-confidence judgment and show the product evidence used.
- [Catalogue searches can include unrelated products] → Permit imperfect result sets but require the proposed choice to match available evidence; uncertain choices remain visible.
- [A grouped UI can add state complexity] → Keep each view stateless, cap it at five decisions, and return user choices to the conversation.
- [Favourites can be stale or unsuitable] → Treat them as supporting evidence only.

## Migration Plan

1. Add failing tests for instructions, proposal validation, the 80% expansion boundary, favourites guidance, and planning that does not inspect the current basket.
2. Update tool instructions and add the minimum read-only proposed-basket contract and view behavior.
3. Route settled product identifiers through the unchanged exact review/apply boundary.
4. Add the representative smoke scenario and update user-facing documentation and package version.
5. Run focused tests, package smoke, root verification, strict OpenSpec validation, and production-readiness checks.
6. Merge through the protected pull-request path, deploy the release-eligible change, and perform fresh read-only ChatGPT acceptance before any separately authorized live basket test.
