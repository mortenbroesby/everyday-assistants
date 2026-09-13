## Context

See `proposal.md` for motivation. Current `review_proposed_basket` already resolves every supplied item, carries `favorite_match` and integer `confidence`, and serves one bundled React resource. `PickerView` renders a full selected-product card for each item and folds only alternatives. The Apps SDK host boundary already supports `sendMessage`; it does not expose direct tool invocation.

The existing payload, strict browser contract, exact-product hydration, alternative choice message, and concurrency-three read coordinator already provide the necessary data and behavior. The gap does not justify a new tool, endpoint, dependency, or state model.

## Goals / Non-Goals

**Goals:**

- Make the complete selected proposal scannable at narrow and wide widths.
- Keep product identity, favourite provenance, confidence, quantity, and price visible.
- Let the user opt individual lines into review while retaining every unchecked assistant selection.
- Support local alternative choice and deliberate catalogue-search requests without browser-side provider or basket access.
- Preserve the current accessible detail evidence and host-message lifecycle.

**Non-Goals:**

- Do not fetch alternatives inside the browser resource or add another server read phase.
- Do not make quantity editable or invoke provider, proposal, or basket tools from the picker.
- Do not redesign ranking, favourite lookup, or automatic-selection policy.

## Decisions

### Reuse the existing proposed-basket payload and resource

Keep `review_proposed_basket`, `ui://nemlig/picker.html`, and the current strict contract. The payload already contains every field required by the new presentation. Adding a second basket-summary tool or resource would duplicate validation, packaging, CSP, and lifecycle behavior.

### Render each selected product as a compact review row

Give `ProductCard` a selected-summary presentation that keeps a small image, product identity, package, price, quantity context, confidence badge, and favourite badge visible. Add a native unchecked `Review this item` checkbox. Checking it reveals the populated evidence, supplied alternatives, and catalogue-search input for that line; unchecking it retains the assistant selection and collapses those controls.

Use native semantic elements and existing Apps SDK UI components/styles. Do not add a virtual list or nested scrolling; fifty bounded rows remain the existing maximum, and the compact layout is the intended mitigation.

### Strengthen guidance for non-favourite choices without new provider work

Update server/tool guidance so one `review_proposed_basket` call contains every selected item. When `favorite_match` is false, clients include relevant usable alternatives already returned by bounded discovery, regardless of whether confidence crosses 80%. The alternative array remains optional because no relevant alternative may exist.

This changes presentation and orchestration guidance, not ranking. Making the server launch new searches would increase provider traffic and duplicate discovery logic, so it is rejected.

### Keep review state local until one final conversational handoff

Initialize a local selected-product map from the assistant selections. Choosing a supplied alternative updates only that map; it does not send a message or alter a proposal. The final `Review selected basket` action sends one bounded message containing every ingredient, chosen product ID, and quantity and asks ChatGPT to continue through the existing exact proposal and approval flow. It remains a review request, not basket authorization.

Use the existing host `sendMessage` boundary for final review and catalogue search. A search is available only on a checked line, uses a bounded text input, and sends one ingredient-scoped request. It performs no browser-side provider call and no automatic retry. Pending-state, stale-callback, duplicate-send prevention, and recoverable failure behavior apply to both message types.

A returned search/review result is a new host payload and may reset local review state. Persisting draft state across conversational turns would add a second state protocol without improving the safety contract.

### Keep exploration separate from basket review

The exploratory product view is a separate experience and OpenSpec change. It may share small visual or evidence components later, but this change does not add exploration sorting, pagination, comparison state, or a shared abstraction before both implementations demonstrate the need.

## Risks / Trade-offs

- **More alternatives may increase detail reads and output size** → reuse only already discovered candidates, retain nine-per-item validation, ID coalescing, concurrency three, cancellation, and existing evidence bounds.
- **Final handoff text can grow with the basket** → retain the existing fifty-item input bound and send only ingredient, chosen product ID, and quantity.
- **A user can lose local choices after a catalogue-search turn** → treat the returned payload as a fresh review and state this in the search control; add cross-turn draft persistence only if testing shows a real need.
- **A compact row can hide useful product distinctions** → keep package and price visible and retain populated evidence disclosures immediately beneath the row.
- **Favourite provenance is supplied by the client workflow** → describe the badge as provenance from the favourite lookup, not proof that Nemlig still marks the product as a favourite after review.
- **Large proposals remain vertically long** → use compact rows and the host page's normal scrolling; do not add virtualization or nested scrolling without measured need.
- **Clients without MCP Apps cannot render the picker** → retain the complete structured result and conversational fallback.

## Migration Plan

1. Characterize complete-item rendering, unchecked defaults, checked-line expansion, local choices, and host-message safety.
2. Add compact rows, local review state, catalogue-search messages, and the final consolidated review message without changing the payload schema.
3. Verify narrow/wide rendering, keyboard operation, text fallback, packed-resource loading, and no provider or basket-tool access.
4. Update feature documentation, apply the required release identity near merge, run the repository gates, and deploy only through the protected release workflow.

Rollback is the previous bundled picker artifact and server guidance. No data or provider migration is required; `NEMLIG_MCP_APPS` remains the existing emergency UI fallback.
