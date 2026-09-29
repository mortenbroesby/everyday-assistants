## Why

Portfolio status (29 September 2026, #114): Current v6 implementation is integrated. Native historical/recovery acceptance owner: #137; deployment evidence is separately reused from #96. Preserve unchecked host gates and the existing lightweight viewer.
See [portfolio evidence](../../../docs/openspec-portfolio-reconciliation.md).

Issue #113 requires a conversational product review surface with optional touch
controls. The current shared viewer can display products but cannot represent
unresolved choices, navigate contextual alternatives, or express user actions.

## What Changes

- Reuse one compact expandable product row across Needs review, Basket, and
  alternatives for one exact product; preserve factual data and safe images.
- Make touch actions express the same user intent as conversation, with exact
  product references, safe exits, and a usable headless fallback.
- Establish the smallest missing contract for a shared review snapshot. Browser
  selection is not basket truth or mutation authority. Keep existing exact
  prepare/review/apply/readback safeguards.
- Supersede the current viewer's prohibition on user-action controls without
  restoring retired whole-list planning, saved lists, or a separate UI workflow.

Goal and acceptance are owned by GitHub issue #113. This change records only the
new durable contracts and design decisions. It now also includes the owner's
follow-up discovery, conversational authorization, and debounce refinements in
this same product outcome and draft PR. Non-goals include onboarding,
meal/recipe planning, checkout, payment, delivery slots, authentication redesign,
new state-management dependencies, and unrelated deployment work.

## Capabilities

### New Capabilities

- `nemlig-product-review`: shared review snapshot, contextual alternatives,
  voice/touch equivalence, navigation, and resolution semantics.

### Modified Capabilities

- `nemlig-mcp`: expose the review surface through existing product/viewer seams
  plus only the demonstrated missing local-state and protected submission contracts.
- `nemlig-chatgpt-integration`: contextual touch intent and conversational actions
  operate on the same product references and reviewed outcome.
- `nemlig-basket-proposals`: restrict real Nemlig basket writes to monotonic,
  explicitly authorized additions; remove assistant clear, removal, and swap paths.

## Impact

One epic on `codex/issue-113-voice-review`, one scoped PR. Initial base:
`01aab68d9d71b6ec2120f845e852c30db630edf1`. Scope is the Nemlig viewer,
presentation/MCP integration, focused tests, product docs and these deltas.
Issue #114 owns historical archival; issue #96 owns production/retention work.
Coordinate overlapping canonical specs and backlog sections before edits.

No live provider, basket, account, secret, or production mutation is authorized by
this repository implementation. Reuse bounded provider reads and existing quotas;
rendering, disclosures and navigation must not create provider request fan-out.
Any added hydration must have an explicit bounded request model before apply.

## Owner decision

On 25 September 2026 the owner confirmed that Basket is a local resolved shortlist.
Only an explicit later submission prepares an exact Nemlig additions review; local
acceptance, replacement and removal never mutate the provider basket. A clear
conversational request to add the current Ready selection itself authorizes only
that exact unchanged prepared payload; Ready status alone is not authority.
Fresh validation and verified readback remain mandatory. UI-initiated submission
retains its exact on-screen confirmation.

On 29 September 2026 the owner made the real Nemlig basket add-only: the assistant
must never remove a provider line, swap products, or clear the provider basket.
An approved request to add two units of a product already present twice means
add two more, leaving four. This rules out sending a smaller absolute quantity
through Nemlig's quantity-setting endpoint. Local selection removal and Clear
Basket remain local-only operations.

The owner subsequently requested the generated compact green review mockup,
conversation-scoped ephemeral Basket state without a one-hour expiry, freely
reversible resolution, and discovery tools that do not create repeated widgets.
The owner approved conversation lifetime with explicit Finish shopping; chat-close
cleanup is not claimed because the host exposes no reliable end-session signal.

The owner also requires release completion to include visible, interactive UI in
the connected ChatGPT app. Deployment health alone is insufficient. Refresh and
verify the app metadata, check the exact viewer artifact, and exercise local
review controls before reporting a UI release delivered.

## Product discovery and tool-surface refinement (29 September 2026)

Users need to see the relevant alternatives returned for an In Review product,
search again when those results miss the intent, and shop entirely through
conversation when they prefer. Today the alternatives path defaults to five,
rejects more than ten, and the viewer requests ten on refinement. Direct
catalogue search and local conversational edits already exist, so this follow-up
extends their contract instead of creating another shopping flow.

- Show every distinct alternative returned by each requested provider search
  when the user has not requested a smaller count, including honest unavailable
  rows. Offer another search from an empty or irrelevant result set. A search
  covers the provider response actually received, not the entire catalogue.
- Let the assistant browse broadly (for example, `smør`), then try a deliberate
  related Danish phrase if needed. It must explain material category differences
  rather than silently treating butter, spreads and margarine as equivalent.
- Make conversational search, local add/quantity/revisit/replace/remove and
  protected real-basket changes easy to select without opening the viewer.
  The local review remains authoritative and actual writes keep exact approval.
- Audit the registered MCP tools against these user jobs. Improve descriptions
  and titles where they cause ambiguity; keep distinct discovery, visual view,
  local-edit and protected-write boundaries. Add, merge, remove or rename a tool
  only with a demonstrated user benefit and verified host/resource behavior.
- Make open-ended catalogue lookup explicit and independent from an existing
  To decide/Ready product; when contextual alternatives are insufficient, allow
  a deliberate broader search without silently turning it into a replacement.
  Keep the user-facing tool set coherent across conversation and viewer controls.
- Trace the reported simple-term search failure through schema, handler, client,
  and error mapping. Distinguish upstream search errors from a successful empty
  result, and improve code only where a fixture demonstrates our boundary is at
  fault.
- Keep an explicitly opened selection visible if a delayed historical-card
  snapshot arrives after the current selection has loaded. The current viewer
  can fold back to its inactive prompt in that exact event order; a fresh mount
  still requires explicit conversation-scoped activation.
- Use shopping language for the workspace: propose **Your Nemlig selection**,
  **To decide** and **Ready**, and **Open current selection**. Keep the exact
  real Nemlig basket distinct from the temporary selection.

This is the same review outcome and the same OpenSpec/PR boundary. Planning and
implementation use `codex/nemlig-product-search-alternatives`, based on
`63cc0eecd570490ed55a1f91078f331d2c2e17e4`, in one draft PR. Issue #113
is the completed baseline. This follow-up addresses the confirmed current-viewer
fold race; #137 native historical-card acceptance and #96 production evidence
remain separate. No provider basket mutation, credential, deployment or new
frontend architecture is in scope.
