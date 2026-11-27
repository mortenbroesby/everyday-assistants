## Why

The November 27 storefront bundle uses a different search and product-detail API from the assistant. A route change alone does not show whether shoppers will get better matches, accurate prices or fewer failed requests. Each operation needs a decision grounded in comparable observations.

## What Changes

Establish a recurring provider compatibility assessment. Inventory the assistant's actual calls, compare ordinary storefront journeys, and publish a decision for each operation. Migrate catalog reads to the current storefront endpoints in independently reversible changes. Prioritize v2 search and exact detail, followed by v3 category browsing. Verify personalized favorites before selecting its replacement. The owner approved authenticated reads on November 27. Live writes require a separate owner checkpoint.

## Capabilities

### New Capabilities

- `nemlig-provider-compatibility` defines evidence required to adopt, retain or defer a provider route.

### Modified Capabilities

None.

## Impact

Research covers the Nemlig client, product normalization, category discovery and review consumers. It informs later changes to the provider adapter. This epic owns the comparison, migration sequence, and acceptance evidence for each adapter switch.
