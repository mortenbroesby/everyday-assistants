## Context

See proposal.md and issue #113. The existing HTML viewer only renders supplied
facts. MCP HTTP creates a server per request but retains an authenticated
principal context with a client and proposal service. No shared product review
draft exists. The owner confirmed a local basket, not immediate provider writes.

## Goals / Non-Goals

One authoritative temporary draft shared by voice and touch, without browser-only
business state, durable saved lists, another state library, or provider writes
from the viewer. Existing discovery and actual basket tools remain independent.

## Decisions

- Add a bounded in-memory review service to the existing principal context; local
  stdio holds it for that server. Opaque review IDs, principal/policy binding and
  optimistic revisions prevent cross-principal access and lost voice/touch edits.
  Scope one active draft to the authenticated principal/policy and host-provided
  `openai/session` conversation key. Do not treat that metadata as authentication.
  Require it for hosted operations; local MCP uses its transport/process scope.
  No time-based expiry. Finish shopping removes the draft. Keep at most eight
  conversation drafts of 50 products per principal context, evicting the least
  recently used idle draft when necessary. Do not evict uncertain/submitted
  outcomes automatically. Report restart/eviction loss honestly. No database, filesystem or browser persistence
  of business state. View-only browser state may retain disclosure/selection.
- Start a draft from exact selected product IDs and quantities. Hydrate once via
  the existing request-local read pool, concurrency three, cancellation and
  principal client cache. Preserve unavailable rows honestly. Pure local edits
  and navigation do not authenticate with Nemlig, fetch or mutate it. Explicit
  alternatives searches use the existing bounded read path and caller limit.
- Expose start/update tools usable by the model and app. Reuse the single viewer
  URI for a compact draft snapshot with two destinations and contextual
  alternatives. One reusable DOM row renders safe text, images and native details.
  The viewer invokes only local-draft operations, never the provider apply tools.
  A host without tool bridging falls back to exact conversational requests.
- Updates require the current revision; show refreshes a stale snapshot without
  modifying it. Return the same complete snapshot to model and UI. Store context
  navigation/alternatives in the service so voice and touch see the same target.
- Preparing submission captures the current resolved lines through the existing
  BasketProposalService. Expose a separate submission reference, not its internal
  proposal ID, and invalidate it on any draft edit. Submit is a separate model-only
  tool after explicit approval of unchanged exact quantities/prices; reuse the
  service's fresh revalidation, principal binding, single use and readback.
  Serialize draft edits against prepare/apply. Keep draft contents after outcomes;
  block repeated submissions of an unchanged submitted or uncertain draft.
- Submission sets the reviewed quantities of selected products in the real
  basket using existing semantics; unrelated provider lines stay unchanged. It
  does not replace/clear the whole provider basket. UI labels distinguish local
  Basket from actual Nemlig submission and never imply that acceptance is sent.

## Risks / Trade-offs

- Drafts are temporary → expose restart and eviction loss, preserve conversational
  exact references for recreation, do not claim durable shopping-list support.
- Voice or another widget changes state → reject stale revisions without effects;
  allow refresh, keep failed-action feedback and safe navigation.
- Provider write succeeds but response/readback fails → preserve uncertainty,
  never retry automatically; inspect the actual basket before a new review.
- Hydration fan-out → max 50 selected IDs/start and explicit alternative limit,
  existing three-read pool and request deadlines; no navigation/expansion reads,
  polling, new storage, service or capacity. Existing quota limits remain unchanged. Start/update use normal admission like existing search and preparation; actual submission remains expensive.
- Existing open historical deltas forbid controls → coordinate #114 and reconcile
  only viewer requirements; do not reopen old planners or deployment policy.

## Migration Plan

Additive MCP tools and reuse of the existing resource. A normal verified package
release updates viewer and server together; old tools remain supported. Rollback
uses the previous reviewed artifact and discards temporary draft state. No stored
records, provider configuration, secrets or account migration is needed.

## Conversation and presentation refinement

Repeated starts return the existing active snapshot unchanged. Use `add` to
append new exact products, `revisit` to return accepted products to Needs review,
and revision-checked `end` to discard the local session without touching Nemlig.
Show can recover the active draft when its opaque ID is absent. No chat-close
notification is documented, so no automatic close-tab deletion is promised.

Discovery and legacy provider tools return data only. Start/update/submit review
tools attach the shared review resource. Initialize the standard MCP Apps bridge
before receiving results; use tools/call and ui/message with compatibility aliases
only as fallback. Render explicit errors, cancelled results and bounded loading
timeouts. Declare only the supported Nemlig image origins in resource CSP.

Match the approved mockup with compact thumbnail rows, aligned prices, native
inline details, muted green navigation/actions and contextual alternatives.
Retain accessible target sizes, phone layouts, dark mode and safe text rendering.
