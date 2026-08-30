# Nemlig Assistant backlog

## Favorites-first product selection

Treat requests to find or add an item as product-search intent.

- Search the authenticated user's favorites first. If one or more suitable
  favorites exist, select from them even when external search might find other
  candidates. Search outside favorites only when no favorite is suitable.
- Apply the same ranking within either candidate pool: aim for the lowest
  comparable effective price, prefer discounted products, and compare price per
  kilogram or other matching unit when available. A discounted product should
  not win when it is still substantially more expensive than a comparable
  alternative.
- When the price difference is not substantial, use the best plausible match
  for the user's request. Ask the user to choose when the remaining candidates
  represent meaningfully different products or the guess would be unsafe.
- Product selection remains discovery. Adding to the basket still requires the
  existing exact proposal and explicit approval flow.

The meaning of "substantial" and handling for incomparable package units need
real examples before implementation; avoid inventing a complex scoring model
until then.

## User-submitted feature requests

Recognize explicit phrases such as "feature request" or "request feature" and
offer to record the user's request for later development.

The first implementation should store the request text, creation time, and an
open/done status in a simple inspectable backlog, confirm what was recorded, and
never treat logging as authorization to implement it or mutate a Nemlig basket.
Choose the durable storage location when this feature is implemented; do not
collect credentials, basket contents, or other unnecessary account data.
