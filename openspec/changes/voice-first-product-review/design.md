## Context

**Current surface:** See [`slim-nemlig-mcp-surface`](../slim-nemlig-mcp-surface/design.md) for the later six-tool and Draft list decisions. Earlier inventory and naming choices below describe the prior implementation and are superseded for this release.

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
  alternatives searches use the existing read path and an optional user count;
  omission does not impose an application result cap.
- Expose start/update tools usable by the model and app. Reuse the single viewer
  URI for a compact draft snapshot with two destinations and contextual
  alternatives. One reusable DOM row renders safe text, images and native details.
  The viewer invokes local-draft operations; only its explicit prepared-review
  confirmation may invoke the protected submission tool.
  A host without tool bridging falls back to exact conversational requests.
- Updates require the current revision; show refreshes a stale snapshot without
  modifying it. Return the same complete snapshot to model and UI. Store context
  navigation/alternatives in the service so voice and touch see the same target.
- Preparing submission captures the current resolved lines through the existing
  BasketProposalService. Expose a separate submission reference, not its internal
  proposal ID, and invalidate it on any draft edit. Submit is a separate
  protected tool after a clear conversational add instruction for the unchanged
  Ready lines or the viewer's exact confirmation; reuse the
  service's fresh revalidation, principal binding, single use and readback.
  Serialize draft edits against prepare/apply. Keep draft contents after outcomes;
  block repeated submissions of an unchanged submitted or uncertain draft.
- Submission adds the reviewed Ready quantities to the latest observed line
  quantities; unrelated provider lines stay unchanged. It never sets a lower or
  equal quantity, removes a line, replaces a product, or clears the provider
  basket. UI labels distinguish local Ready from the actual Nemlig basket and
  never imply that local acceptance has already been sent.

## Risks / Trade-offs

- Drafts are temporary → expose restart and eviction loss, preserve conversational
  exact references for recreation, do not claim durable shopping-list support.
- Voice or another widget changes state → reject stale revisions without effects;
  allow refresh, keep failed-action feedback and safe navigation.
- Provider write succeeds but response/readback fails → preserve uncertainty,
  never retry automatically; inspect the actual basket before a new review.
- Hydration fan-out → max 50 selected IDs/start, provider-returned alternatives,
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

## Release UI acceptance

Keep the existing single viewer URI and native developer-mode Refresh flow.
Automated service acceptance compares the fetched viewer against the candidate
HTML and checks its CSP metadata; regular-user acceptance also checks review-tool
resource metadata. Do not widen the machine service tool allowlist. A successful
Cloudflare rollout does not refresh ChatGPT metadata. The release operator must
refresh the connected app, verify the changed tool catalog, and exercise local
acceptance and forward/back navigation in ChatGPT. Record failure as UI delivery
pending, even when the deployment workflow is green. This adds no polling,
storage, provider write, or new service.

## Stale card recovery

A visible host card can outlive its in-memory draft. Refresh omits the old opaque
reference and reads only the active conversation. Absence is a typed
`unavailable: true` result. An unavailable-action error triggers at most one
read-only lookup, never a replay. The viewer offers an explicit Start new review
using the old exact product IDs/quantities only when no submitted/uncertain
outcome needs inspection. New starts hydrate current facts and reset local
acceptance and submission authority; an existing active review remains unchanged.
Version the viewer URI for this browser behavior change. Smoke the real MCP
adapter with a retained browser card across simulated process state loss, and
verify local recovery/navigation before the actual ChatGPT release smoke.

## Historical cards and conflicting revisions (#137)

No reliable historical-message signal is available. Every host-supplied review
snapshot therefore starts as a compact inactive card, without product rows,
images, or shopping controls. Explicit Open current review performs one
conversation-scoped read, then enables the returned current state. Remounts do
not trust the transcript snapshot or persisted widget state. No automatic
polling, hydration, or age inference is added.

A rejected stale revision or missing draft permits one read-only recovery; it
never replays the failed edit. Other failures hide shopping controls, normalize
the message, and require explicit current-state inspection before retry. Known
retired resource URIs resolve to inert notices with a conversational route to
the current review, not missing resources or old shopping code. Host-cached
pre-change documents cannot be rewritten by the server; test and report that
platform limit. Release acceptance includes these actual historical-card cases.

## Persistent in-place review and interactive submission

Native ChatGPT reproduction on 27 September 2026 showed that local acceptance
and destination navigation change the already-mounted v4 iframe into its own
inactive `Open current review` presentation. The accepted item was present in
Basket after explicit reopening. The viewer has no `requestClose()` call; its
host-output receiver clears `active` on every review snapshot. Preserve an
explicitly activated frame for subsequent snapshots of that same review, reject
older revisions, and ignore unsolicited snapshots for a different review while
that frame is active. Initial/remounted frames remain inactive. Do not
auto-reopen, request close, or infer card age.

Keep presentation-only selection and disclosure state across same-review
updates where the corresponding product remains. Server snapshots continue to
own destination, alternatives context and counts. Avoid a second widget or
browser-owned business state. Basket rows emphasize image, name, pack/brand,
quantity and line price, with catalogue metadata in details, following the
current Nemlig catalogue hierarchy.

`Clear Basket` uses one revision-checked `revisit` of all accepted product IDs:
it empties the local Basket but leaves those products in Needs review for
rebuilding. It never clears the provider basket. A local confirmation names
that effect.

The existing `prepare_submission` produces the exact priced review; a separate
explicit button in that review may call the existing protected
`submit_product_review` tool with the unchanged review ID, revision and
submission ID. Make that tool app-visible without removing its model path or
server-side single-use, expiry, freshness, principal, lock and readback checks.
No submission occurs on preparation, opening a card, or changing destinations.
Failure/uncertainty never triggers a retry. A host without app tool access
retains the conversational approval path and must not claim UI confirmation
worked. Native host confirmation remains a release acceptance requirement.

## Ready review refinement

The mounted v5 card has been observed to remain active across local edits in
ChatGPT. Build on that viewer and its existing protected submission path. The
two product states are now In Review and Ready. Alternatives are a contextual
In Review drill-in, not a third product state: replacing a product leaves it
unaccepted in In Review. Only Ready lines are prepared for submission, even if
other products remain In Review.

Use `ready` as the sole review state and destination value in the service and
MCP contract. Do not add a `basket` alias, representation selector, projection
or stored-state migration. Existing fetched v5 resource URIs become inert.
Already-cached v5 JavaScript cannot be rewritten by the server; if it tries to
send obsolete `basket` actions, the new schema rejects them without a mutation.
The versioned viewer receives only canonical Ready review snapshots. Native
historical card behavior remains a separate acceptance item and is not proven
locally.
Never change the actual Nemlig basket schema or provider proposal semantics.

The viewer keeps product and factual disclosures, checkboxes, focus and
scroll as presentation state. Selection alone makes no tool call. One bulk
accept action handles selected products; there is no per-row acceptance
button. Compact rows show image, name, pack/brand, quantity and line price.
Expanded factual disclosures are Varebeskrivelse, Varedeklaration and Detaljer
om varen, all closed by default and sourced from the supplied snapshot.

The secondary Remove all Ready products action confirms one revision-checked
local `remove` of exactly the accepted IDs. It removes those products from the
selection rather than moving them back to In Review, and never touches Nemlig.
End still discards the whole draft. A zero-product draft or ended draft shows a
purpose-built conversational starting state. A verified submission gets its
own success presentation; uncertain outcomes retain the no-retry boundary.

Changing viewer HTML requires a new URI per the resource cache policy. Each
versioned implementation retains the applicable retired-resource protections.
Deployment and native ChatGPT acceptance remain separate from local
implementation evidence.

## 7 October 2026 registered React viewer update

PR #193 switches the registered resource to the self-contained React v8
artifact and retires v7 as an inert notice. The React view preserves the
server-owned review snapshot, exact prepare and confirmation boundary, and
read-only conversation fallback. Local browser/MCP evidence does not complete
task 9.5: native mounted/historical-card acceptance remains unchecked until a
separately approved release and host verification.

## 29 September follow-up: discovery, language, and historical snapshot race

### Confirmed lifecycle defect

At base `63cc0eecd570490ed55a1f91078f331d2c2e17e4`, the current renderer
accepts unsolicited review snapshots even when their review ID differs from
the explicitly activated one. Historical card A can mount inactive, an explicit
conversation-scoped `show` can return current draft B and activate it, and a
delayed A notification through either host channel can then overwrite B while
setting `active = false`. Existing recovery coverage expects this fold for a
foreign snapshot, so the regression is encoded in the test. Astra reproduced
the event order in the fake host over both bridges and both notification
channels. This establishes an application defect; it does not identify the
unobserved cause of the user's latest native ChatGPT incident.

Keep the frame bound to its confirmed draft after activation. Ignore an
unsolicited different-ID review snapshot while active. Only the correlated
response to an explicit current `show` or recovery action can switch to a
different active draft. Matching-ID older revisions remain ignored. A fresh
mount starts inactive and makes no shopping call before user activation;
retired resources remain inert. Do not persist activation, add reopen logic,
use `requestClose()`, or replay a failed edit. Exercise both notification
channels and both bridges, reversed event order, subsequent local edits, and
explicit switch to a replacement draft. Native host acceptance later records
the served revision and whether a card remounted; a local reproduction alone
cannot prove the host's separate lifecycle behavior.

### Discovery and alternatives

`find_groceries` already has an optional count and no application ceiling when
omitted. The alternatives schema currently permits at most ten, the service
defaults to five and slices the result, and the viewer requests ten on
refinement. Remove those three alternatives-only limits. Pass an omitted count
through the existing detailed search; retain a positive count only when the
user requests one. Preserve result order, duplicate-ID handling, incomplete
facts, the existing concurrency-three detail pool, cancellation, and revision
checks. There is no new browser-side product state or automatic synonym tree.

The existing alternative form becomes an explicit **Search for more products**
action with the same target product. It can start from a useful category phrase
instead of repeating a full branded product name. Each new search replaces the
authoritative candidate set; choosing an earlier candidate requires finding it
again. Display “No new alternatives for this selection” when returned IDs are
already present locally, and distinguish incomplete detail reads from no
matches. A broad query may require more detail reads and outlast the viewer's
loading wait: keep cancellation and a recoverable state, verify the slow case,
and avoid a silent result cap or automatic retries.

One uncounted search means every unique eligible candidate in the response
actually returned. The Nemlig client issues one search response and does not
enumerate the whole catalogue. The assistant can deliberately search another
concise Danish phrase after inspecting results. It should explain material
category differences, such as butter versus margarine, and describe the
queries performed instead of claiming exhaustive catalogue coverage.

### 29 September follow-up: quantity batching and clarification continuity

Quantity +/- presses update the displayed quantity and line total immediately,
but persist through the existing revision-checked selection update after a
400 ms quiet interval. A burst for one product sends only its final quantity.
Before navigation, another mutation, prepare, or submit, flush any pending
quantity first and serialize the next action after its confirmed revision.
Optimistic quantities are presentation-only; an error or stale revision clears
them, uses at most the existing read-only recovery, and never replays a failed
edit or submits an unconfirmed quantity. Submission always uses the server's
current Ready rows and the protected exact proposal path.

The clarification regression has an application cause, not a proven ChatGPT
host lifecycle cause: a conversational add of a new To decide item moves the
destination there and currently deletes the prepared submission/proposal even
when the Ready IDs and quantities did not change. Keep a prepared capability
only while the exact Ready product IDs and quantities it represents remain
unchanged. Any Ready addition, removal, revisit, or quantity change invalidates
it. To decide-only changes may advance the selection revision but preserve the
prepared exact lines; the viewer still requires the user to inspect/confirm
those lines before a UI-initiated write. A conversational “add the current Ready
selection to my Nemlig basket” is itself explicit authorization for that exact
current payload, so the assistant must not ask a redundant approval question.
Ready status alone is not authorization. If scope is unclear, an exact Ready
line changed after intent, or the intent cannot be bound to the prepared set,
ask the user to clarify. Existing fresh provider revalidation, proposal
principal/conversation binding, single-use serialization, readback and
uncertain-write/no-retry safeguards remain mandatory.

Open-ended catalogue search is an independent discovery job, not an implicit
continuation of the currently selected product's alternatives. A phrase such as
“salmiak” goes directly to `find_groceries`, even with a selection or alternatives
context open, and must not alter local membership or implicitly replace a row.
Alternatives can offer a deliberate new phrase when they are insufficient; the
assistant may then search broadly through the same direct tool without forcing
the result set into that target. The existing tool jobs are sufficient, so this
request does not justify a broad rename, merge, or parallel interface.

The current request path validates `search_term`, passes it to
`resolveDetailedProductSearch`, calls Nemlig's primary `/search` endpoint, and
propagates an HTTP 500 as a status-bearing `NemligError`; MCP maps it to an
error result (`Search products failed (HTTP 500).`). It does not convert that
failure into an empty result. A successful empty response instead becomes a
successful structured empty result with “No products found.” The agent-facing
guidance should preserve this distinction: report provider failure as failure,
empty response as no matches in this response (not catalogue-wide absence), and
do not invent results or automatically repeat the same failing query. Add a
fixture-backed MCP regression for the complete schema→handler→HTTP→error path;
do not call the live provider. If that regression confirms current behavior,
retain code/error mapping and make only the demonstrated instruction/test
improvement.

### MCP tool surface and wording

The current inventory has 21 tools: ten read-only, four preparation, two local
selection, and five external-state actions. The add-only boundary below reduces
this to 15 by removing three provider prepare/apply pairs; compare the jobs to the official
[GitHub MCP server](https://github.com/github/github-mcp-server), which offers
toolsets and individual allowlists, the reference
[filesystem server](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md),
which labels reads and writes with tool annotations, and the reference
[memory server](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/index.ts),
which separates search from opening exact matches. These are design comparisons,
not evidence that a rename or a larger toolset improves our ChatGPT host.

| Current tools | Decision for implementation | Reason |
| --- | --- | --- |
| `find_groceries`, `get_grocery_details` | Keep both; clarify broad search versus exact detail and omitted-count behavior. | Search and exact inspection are distinct user requests. |
| `show_my_basket`, `show_my_basket_visually` | Keep both; make the text versus current visual view explicit. | Visual hydration and host rendering have different cost and evidence. |
| `start_product_review`, `update_product_review` | Keep the state boundary; describe starting versus editing a temporary selection, including conversation-only add, quantity, revisit, replace and remove. | Both paths already share server authority; a new conversational tool would duplicate it. |
| Provider-basket tools | Keep only `review_items_to_add` → `add_approved_items` plus the selection submission path; remove prepare/apply tools for provider removal, clear, and swap. | The owner has made the actual Nemlig basket add-only; exact approval does not authorize destructive operations. |
| Profile, connection, favourites and section tools | Retain; check titles and annotations for their separate identity, recovery and browsing jobs. | No demonstrated overlap justifies removal in this follow-up. |

Tool inventory and annotation tests should verify any title/description edits.
Avoid renaming machine tool IDs or altering the service acceptance allowlist
without a concrete selection defect and a corresponding host check. Keep
read-only, preparation, local-edit, and actual-write distinctions truthful;
`update_product_review` includes edits and therefore is not read-only even
when its `show` action only reads. Local selection `remove` and `clear` actions
remain separate and never call provider basket mutation APIs.

Use **Your Nemlig selection** for the workspace, **To decide** for unresolved
rows, **Ready** for accepted rows, and **Open current selection** for explicit
activation. “Review” describes a process, while “selection” describes the
thing the household is building; “To decide” describes the remaining action.
Keep internal `review_id`, `needs-review`, and MCP tool IDs for this scoped
change because their semantics stay correct. This is a copy decision, not a
compatibility layer. Continue to call the provider state the **Nemlig basket**.
Check mobile, screen reader labels, tool titles, empty state, errors and
conversational prompts for contradictory wording. Viewer content changes
require the next versioned resource URI and release note under repository
policy; no release is part of this planning PR.

### Add-only Nemlig basket invariant

Nemlig's `/basket/AddToBasket` request is an absolute quantity setter, not an
increment operation; quantity zero removes a line. Treat user-authorized
quantities as increments. Read the current basket, bind that snapshot to the
proposal, calculate current quantity plus approved addition, and send only a
positive target greater than the observed current quantity. Re-read and reject
stale basket snapshots before writes, serialize assistant writes, and verify the
resulting quantities and totals. If an existing line's quantity is incomplete,
fail closed. Remove all provider remove/clear/swap operations from clients,
proposal services, CLI, MCP, and production acceptance; production acceptance
must not perform a destructive restoration after adding a test line.

The provider API inventory contains no compare-and-set or atomic increment
endpoint. A simultaneous change made directly on Nemlig.com after our last read
but before its absolute setter is an external race the assistant cannot
eliminate; do not claim cross-client atomicity. The assistant itself must never
intentionally submit zero or a quantity at or below its last observed line.

## 8 October staged visual refinement

The current React viewer (`src/picker/product-viewer.tsx`) already uses the
authoritative snapshot and performs local editing through the existing
revision-checked tool path. The refinement therefore changes the composition,
hierarchy, copy and native controls in that component; it does not add a second
browser business model or another page/router.

### Story gates

Before Story 1, verify and record the resource URI actually served in native
ChatGPT (expected baseline: v8; do not infer it from source or `main`). Then
explicitly activate the viewer, perform one local destination navigation or
edit, and record whether the same mounted frame remains visible. If the host
serves another URI or fails before the viewer loads, record the exact boundary
and reconcile the baseline before drawing lifecycle conclusions. Test the story
locally without inventing a viewer workaround.

Each story has the same release boundary: one focused PR, the normal local
tests and browser smoke, versioned viewer identity/release evidence when viewer
HTML changes, exact-head CI, merge/release, then a separately recorded native
ChatGPT smoke before the next story begins. A failed or unavailable native
smoke blocks the next story but does not rewrite the completed local evidence.

1. **Compact product-row foundation.** Rework existing To decide and Ready
   rows for scanability—image, name, pack/brand, quantity and line price—while
   retaining accessible native disclosure controls and the existing supplied
   facts. There are no server or provider calls for expanding a row or factual
   detail. This story does not add new destinations or actions.
2. **Local selection action hierarchy.** Make batch acceptance the sole To
   decide acceptance path and make Ready's existing per-row move-back/remove
   paths discoverable through expansion. Remove redundant summary/banner or
   action clutter rather than adding controls. Keep the one relevant primary
   action in each state; local destructive operations retain an explicit local
   confirmation and name that they never alter the Nemlig basket.
3. **Contextual alternatives comparison.** Keep the current product distinct
   without an internal divider, show returned alternatives as immediately
   comparable product information rather than a second hidden accordion, and
   preserve the existing current-candidate-only replacement path. No candidate
   can be accepted implicitly.
4. **Outcome and entry states.** Simplify exact confirmation, success,
   unavailable and empty views. Empty starter suggestions are conversational
   suggestions only unless a standard host follow-up/message API is verified;
   they never start provider work or mutate a selection by themselves. A
   compact overflow menu may contain only already-supported local actions.
   It must not claim that it can close the host card or open nemlig.com until
   that exact host capability is observed and tested.

### Interaction decisions

- Use native buttons, `<details>` or their equivalent accessible controls for
  every in-view disclosure. Checkboxes stop propagation from row expansion.
  Presentational expansion, selection and scroll state may be local; membership,
  quantity, state, revisions, alternatives and submission remain server-owned.
- The ready count belongs in the destination tab, not in a second green
  summary banner. A card must not show an action that does not apply to its
  destination or mode.
- Ready does not offer alternatives. Expanded Ready rows expose only local
  remove and return-to-To-decide actions; expanding To decide exposes quantity,
  supplied factual information and alternative choice. The actual basket write
  remains in the exact confirmation path.
- Alternative cards show the supplied comparison facts immediately. Long
  declaration/detail text may retain labelled factual disclosures, but the
  row's identity, size, price, unit price and relevant badges are not hidden
  behind an additional product accordion.
- Success is a distinct verified outcome. Empty is the zero-selection entry
  surface, not a replacement for verified success.

### Rejected approaches

- **New UI resource or client router:** rejected; the current viewer resource
  and server snapshot are sufficient and another lifecycle creates new cached
  resource and state risks.
- **Automatic reopen/close behavior:** rejected; it would hide a host lifecycle
  failure and cannot prove a mounted card persists. Continue to diagnose a
  demonstrated lifecycle fault at the host/viewer boundary.
- **Direct empty-state provider actions or a second submit tool:** rejected;
  conversational starters and presentation affordances cannot bypass the
  existing exact authorization, freshness, single-use, readback and no-retry
  boundary.

### Risks / trade-offs

- **A visual simplification hides a necessary safety step** → Keep exact
  prepared confirmation and local-clear confirmation visible in their relevant
  contexts; assert actions and provider-call counts in existing loopback tests.
- **A cached viewer mismatches a changed resource** → follow existing resource
  versioning and retired-resource rules; native acceptance records the served
  URI rather than assuming a refresh succeeded.
- **A host control is unavailable** → render the correct static/conversational
  fallback and do not add speculative APIs, message heuristics or `requestClose`.
