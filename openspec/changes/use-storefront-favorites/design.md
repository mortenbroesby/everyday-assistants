## Context

Earlier comparison found 321 distinct legacy favorites and 249 storefront favorites in one account. The owner selected website membership. The legacy and storefront counts may vary over time.

## Goals / Non-Goals

Match the signed-in storefront, preserve Danish search, ordered deduplication, and caller pagination.

## Decisions

Read the page with authenticated account and delivery context. Normalize the product cards in display order. A snapshot of the storefront defines what this operation can return.

## Risks / Trade-offs

Some previously returned products disappear and some newly appear. Surface provider errors so callers can distinguish failures from an empty result.

## Verification

The current storefront entry routes favorites through its CMS resolver, which requests `GET /productbff/api/web/page` with `path=/favoritter` and the active slot ID. The authenticated root page contained 21 product-list sections and 324 card appearances, all explicitly favorited. Deduplication yielded 249 products. The one section navigation link repeated its 45 cards in the same order. The other 20 sections had no navigation button. The legacy source returned 108 additional favorites and missed 36 shown by the current storefront in this comparison. Counts describe one account and delivery context.
