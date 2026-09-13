## 1. Characterize the Missing Evidence

- [x] 1.1 Add a live-shaped exact-product fixture containing HTML `Text`, HTML `DeclarationLabel`, and array-valued `Attributes`; verify the focused client test fails because current normalization omits declaration and attribute values.
- [x] 1.2 Add request fixtures proving a search-card cache entry is upgraded through the first-party exact-product endpoint, a hydrated entry is reused, a later shallow search cannot downgrade it, and fresh pre-mutation lookup still bypasses cache; verify the focused client tests fail before implementation.
- [x] 1.3 Add picker/MCP fixtures with nine ordered alternatives and conditionally absent evidence categories; verify contract or rendering tests expose the current four-item ceiling and empty accordion behavior.

## 2. Hydrate Exact Product Detail

- [x] 2.1 Capture product-import timestamp and delivery-zone context during the existing session refresh and construct the exact `Products/Get?id=` read through the current authenticated JSON boundary; verify URL, headers, cancellation, 404, and retry behavior in client tests.
- [x] 2.2 Make `getProduct` upgrade shallow products and safely cache hydrated products without weakening `getFreshProduct`; verify exact IDs, no cache downgrade, bounded cache behavior, and disappeared-product tests pass.
- [x] 2.3 Normalize bounded description, declaration, and visible string or string-array attributes as separate domain fields; verify markup sanitization, ordering, filtering, malformed input, and length/count ceilings in focused tests.

## 3. Carry Evidence and Alternatives Through Review

- [x] 3.1 Thread declaration through product presentation, MCP candidate schemas, and the strict picker contract; verify structured-content round trips preserve all three evidence categories.
- [x] 3.2 Raise the per-ingredient alternative envelope to nine and update tool guidance to describe one selected product plus the remainder of one normal ten-result search page; verify duplicates, selected-ID reuse, ten alternatives, and pre-read validation behavior.
- [x] 3.3 Extend the coalesced review fixture from 250 to 500 maximum references and verify ordered completion never exceeds three active reads, while cancellation and fatal-failure quiescence remain green.
- [x] 3.4 Render only populated description, declaration, and item-detail accordions for every product card while preserving folded alternatives and product islands; verify narrow and wide picker tests show all nine alternatives without overflow.

## 4. Verify and Prepare the Epic

- [x] 4.1 Update the Nemlig README feature-set description and synthetic showcase to match implemented detail hydration and alternative capacity; verify package/UI checks remain self-contained and make no live Nemlig call.
- [x] 4.2 Run focused client, review, MCP, contract, rendering, smoke, privacy, and package checks, then `openspec validate hydrate-picker-product-details --strict`; record exact passing commands in the pull request.
- [x] 4.3 Refresh the jCodeMunch index for changed files, review the final diff for secrets, unintended basket access, unbounded reads, unsafe markup, or unjustified abstractions, then run the final `pnpm verify` once.
- [x] 4.4 Apply the required Nemlig version and concise release note, reconcile current `origin/main`, commit and push the epic, open one pull request, and verify exact-head CI without merging or deploying before the existing checkpoints.
- [x] 4.5 Add an OpenAPI-compatible JSON manifest for every client-used and currently observed first-party Nemlig endpoint, with partial schemas, evidence, confidence, authentication, and mutation metadata.
- [x] 4.6 Add a dependency-free drift check and contributor instructions, prove the check fails for an omitted client endpoint, then run focused validation and the final repository gate before updating the pull request.
