## Context

See `proposal.md` for motivation. Live read-only inspection on 2026-09-13
confirmed that Nemlig search-gateway products are shallow cards containing
identity, package, price, image, category, and availability but no `Text`,
`DeclarationLabel`, or `Attributes`. The product page separately calls:

`/webapi/{CombinedProductsAndSitecoreTimestamp}/{TimeslotUtc}/{DeliveryZoneId}/{UserId}/Products/Get?id={id}`

That response uses `Text` for the product description, `DeclarationLabel` for
the declaration, and array-valued `Attributes` for product details. The current
client instead resolves exact IDs through search and returns its completed-card
cache, while its attribute normalizer accepts string values only.

The merged review refactor already coalesces unique product references and runs
them through an abort-aware request-local Effect pool at concurrency three.
The React picker already nests alternatives under their ingredient island and
keeps that section folded.

## Goals / Non-Goals

**Goals:**

- Make exact-product hydration the authoritative source for picker evidence.
- Preserve three semantically distinct evidence categories end to end.
- Match the visible product-view attributes while treating provider payloads as
  untrusted, bounded input.
- Let one ordinary ten-result discovery page contribute one selection plus up
  to nine alternatives without increasing simultaneous provider pressure.

**Non-Goals:**

- Do not scrape product HTML at runtime or add Playwright to the application.
- Do not broaden authenticated retries, add a process-global cache or queue, or
  parallelize any mutation.
- Do not fetch rich detail for every ordinary search result; hydrate only exact
  references entering review or proposal validation.

## Decisions

### Call the product API used by the first-party product page

Store `CombinedProductsAndSitecoreTimestamp` and `DeliveryZoneId` beside the current
session values populated during authentication. Exact-product resolution uses
those values, the current timeslot and user ID, and the existing authenticated
JSON transport to call `Products/Get?id={id}`.

This is preferable to rendered-page scraping because it is the page's own
structured source, reuses existing request headers/cancellation/retries, and
adds no browser dependency. Continuing to search by numeric ID was rejected:
the gateway returns shallow cards and therefore cannot satisfy the evidence
contract.

### Distinguish shallow and hydrated products in the existing client cache

Keep the bounded product map, plus a set marking IDs loaded from the exact
detail endpoint. `getProduct` may reuse an already hydrated entry but SHALL
upgrade a shallow search entry. `getFreshProduct` always bypasses both markers
for pre-mutation validation. Remembering a later shallow search result must not
downgrade a hydrated cache entry.

This retains coalescing and avoids repeated detail calls without inferring
hydration from optional fields, because a legitimate detailed product may omit
all three evidence categories.

### Model description, declaration, and details separately

Add an optional declaration field to the domain product, MCP candidate, product
presentation, and picker contract. Normalize `Text` and `DeclarationLabel`
through the existing HTML-to-text converter with explicit length ceilings.
Normalize each `Attributes.Value` from either a string or an ordered string
array, joining meaningful values before the existing per-entry bound.

The picker no longer guesses declarations by matching arbitrary detail keys.
It renders an accordion only when its corresponding field has content. Visible
attributes follow the product page's filtering intent; provider-only hidden
markers are not exposed.

### Bound alternatives to one normal discovery page

Raise the per-item schema from four to nine alternatives. Nine is coupled to
the established default ten-result catalogue page: the chosen product plus all
other ordinary-page choices. The MCP guidance will state this explicitly so
clients do not default to an unexplained two.

Removing the bound was rejected because fifty review lines with arbitrary
arrays could create unbounded input, memory, output, and queued external reads.
Simultaneous reads remain three; only total accepted work increases from 250 to
500 references in the maximum request, with duplicate IDs coalesced.

### Keep a partial OpenAPI contract with explicit evidence

Add one OpenAPI 3.1 JSON document for the private Nemlig endpoints currently
used by the client and the additional first-party endpoints observed during the
2026-09-13 anonymous Playwright trace. Each operation records whether it is
used, merely observed, read-only, authenticated, or mutating, plus a confidence
level and source evidence. Schemas remain deliberately partial and permissive:
unknown provider fields are expected, while fields on which our client depends
are described explicitly.

A dependency-free Node check parses the document and compares its declared
client source patterns with endpoint expressions extracted from `client.ts`.
This is a drift alarm, not a claim that the manifest exhaustively describes
Nemlig's private API. Generating client code from the document was rejected
because the upstream contract is undocumented and incomplete; introducing an
OpenAPI package was also rejected because native JSON parsing and a small
focused check cover the current maintenance need.

## Risks / Trade-offs

- **Private upstream endpoint changes** -> Keep its URL construction in the
  client boundary, cover a live-shaped fixture, sanitize failures, and retain
  the existing missing-product behavior.
- **Detail hydration adds latency** -> Hydrate only products explicitly entering
  review, coalesce IDs, retain the bounded detailed cache, and keep concurrency
  at three.
- **Large declarations inflate MCP payloads** -> Strip markup and cap each
  evidence field plus detail count/key/value sizes at the contract boundary.
- **Search after detail could replace rich cached data** -> Make cache writes
  hydration-aware and characterize the downgrade case.
- **More alternatives increase worst-case queued reads** -> Cap at one normal
  discovery page, retain cancellation/quiescence, and add a 500-reference
  concurrency fixture without promising provider latency.
- **The reverse-engineered manifest looks more authoritative than it is** ->
  Mark the document, operations, evidence date, and partial schemas clearly;
  keep unknown fields permissive and never describe it as provider-supported.
- **Endpoint code and documentation diverge** -> Run the source-pattern drift
  check in the ordinary package test suite and document how to update evidence.

## Migration Plan

1. Add failing live-shaped normalizer, exact-detail request/cache, nine-choice,
   contract, and conditional-accordion tests.
2. Add session detail context and exact-product retrieval, then thread the
   categorized evidence through presentation and picker schemas.
3. Update tool guidance and the synthetic showcase; verify folded mobile and
   desktop rendering without any live basket operation.
4. Add and validate the reverse-engineered API manifest without making a live
   provider request or recording tokens, cookies, credentials, or payload data.
5. Run focused tests, strict OpenSpec validation, package checks, and one final
   `pnpm verify`; apply the release version and note near the pull-request merge.
6. Roll back by reverting the release commit. No persisted data or provider
   migration is required.
