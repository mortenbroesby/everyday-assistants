# Nemlig conversation issue #345

On 2026-10-24, a hosted conversation created a temporary draft that grew from
28 to 30 products after the user clarified two requested items. The model's
written list omitted a requested long-life milk before Nemlig tools were used;
that omission is not evidence of a catalogue or MCP defect. The user also
clarified a required diaper size, which was correctly requested before
selection. During later product matching, two requested products were reported
unavailable, yogurt was selected in a different package than requested, and a
cream shelf-life requirement remained unresolved. These product-selection
observations are separate from the reproduced UI and action-schema defects;
this implementation change does not establish that they are fixed.

The host recorded a 7m05s initial preparation turn and a 1m25s follow-up turn.
A later show request took 44s and was summarized as showing the review, but no
card appeared. A separate explicit UI request took 2m34s; activity summaries
indicated a review-interface fallback had been designed and UI display
executed, but there was no visible final reply or card. An add request took
2m14s, reported submission preparation rejected,
then displayed the card. These are whole host-turn durations, not provider
latency measurements. Historical raw request and response payloads are not
available, so they do not prove which exact tool arguments were sent.

Repository inspection reproduced two matching contract defects: the hosted
conversation update tool omitted the review UI resource metadata attached to
draft creation, and its model schema advertised `prepare_submission` even
though the active direct-draft handler rejected it. The fix shares the hosted
review resource metadata with conversation show/edit and removes that action
from the model-facing schema. Inspection also found `discard_pending_update` in
the model schema although direct draft updates have no handler for it and
silently return an unchanged review; it is removed from model guidance while
the app-only schema stays unchanged. Exact direct submission remains protected
by the draft and review-context bindings, the reviewed item comparison, the
durable no-replay fence, and additive basket readback.

Synthetic MCP tests cover the local behavior and metadata contract. They do not
prove that this historical request followed the same path, that a hosted
release is active, or that native ChatGPT renders the card correctly. No live
basket mutations were performed for this issue. After a hosted release,
acceptance still requires checking fresh connected tool metadata first and
reopening the conversation to verify card rendering. Refresh metadata only if
the fresh listing is stale. An explicit live submit is a separate basket
mutation and was not part of this task.
