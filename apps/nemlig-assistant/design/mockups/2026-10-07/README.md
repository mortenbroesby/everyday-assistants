# Nemlig Assistant design artifacts — 2026-10-07

These are the reviewed, standalone design artifacts from the early visual
exploration. They are deliberately committed so follow-on UI work can begin
from the same concrete states rather than reconstructing them from chat.

See the parent [`AGENTS.md`](../AGENTS.md) before modifying these references.

- `nemlig-review-state-gallery.html` — interactive state gallery: To decide,
  Ready, Alternatives, confirmation, success, empty, and unavailable states.
- `nemlig-review-look-and-feel.html` — focused product-row and visual-language
  exploration.
- `nemlig-unified-review.html` — proposed one-list local basket. Swipe left
  past halfway to reveal the trash action, or right past halfway to browse
  fixture alternatives; both action icons move with the drag. Use the product's
  Remove button, clear or undo local changes, adjust quantities, and preview
  the exact remaining items through Submit to Nemlig.
  The fixture never writes to Nemlig.
- `nemlig-selection-focused-list.svg` — static compact-list reference.

They use fixture content only and make no provider, MCP, or network calls.
They are design references, not the shipped ChatGPT widget and not acceptance
evidence for it.

To inspect them locally:

```sh
python3 -m http.server 8766 --bind 0.0.0.0 \
  --directory apps/nemlig-assistant/design/mockups/2026-10-07
```

Open `http://localhost:8766/nemlig-review-state-gallery.html`.

For the unified proposal, open
`http://localhost:8766/nemlig-unified-review.html`. The production follow-up
would replace destination tabs with one local basket whose remaining items form
the basket-addition candidate. That changes how review state is represented
and needs explicit contract work. Clear must affect only the local basket;
retain alternative selection, prepared-submission invalidation, and the
existing exact authorization and readback safeguards.
