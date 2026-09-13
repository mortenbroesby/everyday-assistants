## Context

See `proposal.md` for motivation. Current `review_proposed_basket` already resolves every supplied item, carries `favorite_match` and integer `confidence`, and serves one bundled React resource. `PickerView` renders a full selected-product card for each item and folds only alternatives. Server guidance requires all decisions before adding, but requests alternatives primarily below 80% confidence.

The existing payload, strict browser contract, exact-product hydration, alternative choice message, and concurrency-three read coordinator already provide the necessary data and behavior. The gap does not justify a new tool, endpoint, dependency, or state model.

## Goals / Non-Goals

**Goals:**

- Make the complete selected proposal scannable at narrow and wide widths.
- Keep product identity, favourite provenance, confidence, quantity, and price visible.
- Give non-favourite selections a useful interactive choice when discovery already found alternatives.
- Preserve the current accessible detail evidence and host-message lifecycle.

**Non-Goals:**

- Do not fetch alternatives inside the browser resource or add another server read phase.
- Do not make quantity editable, add an approval button, or invoke basket tools from the picker.
- Do not redesign ranking, favourite lookup, or automatic-selection policy.

## Decisions

### Reuse the existing proposed-basket payload and resource

Keep `review_proposed_basket`, `ui://nemlig/picker.html`, and the current strict contract. The payload already contains every field required by the new presentation. Adding a second basket-summary tool or resource would duplicate validation, packaging, CSP, and lifecycle behavior.

### Render the selected product as a compact row

Give `ProductCard` a selected-summary presentation that keeps a small image, product identity, package, price, quantity context, confidence badge, and favourite badge visible. Keep description, declaration, and item details in their existing populated-only disclosure controls. Alternatives remain a separate disclosure beneath the same ingredient row.

Use native semantic elements and existing Apps SDK UI components/styles. Do not add a virtual list or nested scrolling; fifty bounded rows remain the existing maximum, and the compact layout is the intended mitigation.

### Strengthen guidance for non-favourite choices without new provider work

Update server/tool guidance so one `review_proposed_basket` call contains every selected item. When `favorite_match` is false, clients include relevant usable alternatives already returned by bounded discovery, regardless of whether confidence crosses 80%. The alternative array remains optional because no relevant alternative may exist.

This changes presentation and orchestration guidance, not ranking. Making the server launch new searches would increase provider traffic and duplicate discovery logic, so it is rejected.

### Keep choice conversational and proposal authority unchanged

Retain the existing message `Choose product <id> for <ingredient> instead.` A choice is an input to the ongoing conversation, not a proposal edit or authorization. Pending-state, stale-callback, failure, and single-send protections remain unchanged.

## Risks / Trade-offs

- **More alternatives may increase detail reads and output size** → reuse only already discovered candidates, retain nine-per-item validation, ID coalescing, concurrency three, cancellation, and existing evidence bounds.
- **A compact row can hide useful product distinctions** → keep package and price visible and retain populated evidence disclosures immediately beneath the row.
- **Favourite provenance is supplied by the client workflow** → describe the badge as provenance from the favourite lookup, not proof that Nemlig still marks the product as a favourite after review.
- **Large proposals remain vertically long** → use compact rows and the host page's normal scrolling; do not add virtualization or nested scrolling without measured need.
- **Clients without MCP Apps cannot render the picker** → retain the complete structured result and conversational fallback.

## Migration Plan

1. Characterize complete-item rendering, favourite/confidence labels, alternative behavior, and the current choice-message safety contract.
2. Add the compact selected-row presentation and strengthen MCP guidance without changing the payload schema.
3. Verify narrow/wide rendering, keyboard disclosure, text fallback, packed-resource loading, and no basket-tool access.
4. Update feature documentation, apply the required release identity near merge, run the repository gates, and deploy only through the protected release workflow.

Rollback is the previous bundled picker artifact and server guidance. No data or provider migration is required; `NEMLIG_MCP_APPS` remains the existing emergency UI fallback.
