# Nemlig Assistant design artifacts — 2026-10-07

These are the reviewed, standalone design artifacts from the early visual
exploration. They are deliberately committed so follow-on UI work can begin
from the same concrete states rather than reconstructing them from chat.

See the parent [`AGENTS.md`](../AGENTS.md) before modifying these references.

- `nemlig-review-state-gallery.html` — interactive state gallery: To decide,
  Ready, Alternatives, confirmation, success, empty, and unavailable states.
- `nemlig-review-look-and-feel.html` — focused product-row and visual-language
  exploration.
- `nemlig-unified-review.html` — proposed single Draft list view with To decide
  and Ready visible together. Fixture controls move products locally, adjust
  quantities, and preview the exact Ready lines without a basket write.
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
would replace the two destination tabs with these sections while retaining
per-item review state, alternative selection, prepared-submission invalidation,
and the existing exact authorization and readback safeguards.
