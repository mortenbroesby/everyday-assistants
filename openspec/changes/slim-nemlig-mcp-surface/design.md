## Context

See [proposal.md](proposal.md). The current MCP server registers fifteen user tools and a separate, smaller machine-service catalog. The Draft list already shares one server-owned state and protected submission path with the viewer. The real basket is add-only; its provider endpoint sets absolute line quantities, so preparation and readback safeguards remain necessary.

## Goals / Non-Goals

**Goals:** Expose the six retained user tools, keep machine-service access read-only, use stable names for the two places products can live, and preserve the existing exact Ready submission safeguards.

**Non-Goals:** Rename protocol tool IDs or `review_id`; change provider credentials, quota, OAuth, basket math, checkout, or deployment infrastructure; mutate any real basket during implementation.

## Decisions

1. **Delete registrations, keep the guarded core.** Remove the nine advertised tool registrations and any registration-only schemas/helpers. Keep the proposal service because Draft list submission calls its exact prepare/apply engine. This avoids a new basket write implementation.
2. **Keep the plain basket read.** `show_my_basket` supplies current provider truth and verified post-error inspection. The separate visual-basket action only hydrates basket items for its own viewer and adds another model choice; retiring it does not remove basket access.
3. **Keep the current internal review protocol.** The machine tool IDs, `review_id`, and `needs-review` state stay stable. Titles, descriptions, viewer copy, errors, README, and instructions use Draft list, To decide, Ready, and Nemlig basket. This avoids a second breaking migration beyond the intentional catalog deletion.
4. **Update each closed inventory.** The service fixture allows only search and actual-basket read; production acceptance, gateway allowlists, package smoke, and MCP enumeration assert the new sets. Requests for retired names fail normally. For authenticated users without provider credentials, protocol discovery remains available; removed profile calls no longer bypass the credential gate.

## Risks / Trade-offs

- **Existing clients call retired tool IDs** → Major version, release note, and normal unknown-tool response; the Draft list and search routes are documented.
- **Less explicit favorites, section, or product-detail navigation** → Search already returns detailed current candidates. This is a deliberate product capability reduction; live ChatGPT acceptance should check whether the six-tool catalog is understandable after release.
- **Less visual detail for the actual basket** → Keep all actual basket lines and totals in structured/text output and avoid claiming visual cards were rendered.
- **Term drift across UI and agent instructions** → Check tool text, viewer copy, error paths, README, and OpenSpec with focused tests and a final string audit.

## Migration Plan

Build and test locally on `codex/nemlig-six-tool-surface`, then deliver one PR with version `6.0.0` and its release note. Merge/release/deployment are separate approval and exact-head gates. Existing user-visible app metadata needs a ChatGPT refresh after deployment; no legacy aliases are advertised. Rollback uses the prior exact released image/version and catalog, subject to the existing deployment gate.
