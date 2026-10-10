## Context

See [proposal.md](proposal.md). The merged shared-card work makes supported
cards interchangeable within one current process-local review scope, but the
scope is still keyed with ChatGPT session/conversation context and is lost with
the MCP process. Open PR #272 introduces the Local basket product language and
#274 applies that UI direction to the shipped viewer; this change must start
only after both have landed.

`find_groceries` is independent of product-review ownership. The observed
32/37 failure report is therefore a discovery/reliability investigation, not a
storage-recovery symptom. Current per-search detail hydration is bounded, but
the aggregate fan-out across simultaneous host tool calls is not yet evidenced.

## Goals / Non-Goals

**Goals:**

- One owner can recover, list, select, edit, and explicitly delete unexpired
  Local baskets from supported chats for 24 hours after intentional activity.
- A container restart cannot discard successful local-basket edits.
- Old cards recover predictably: they act on their identified Local basket or
  offer explicit selection/creation after deletion or expiry.
- Search reliability is measured before changing concurrency, and verified
  partial catalogue results remain useful.
- Existing provider-write safeguards remain stronger than Local basket recovery.

**Non-Goals:**

- Permanent saved lists, history, cross-owner sharing, arbitrary labels/folders,
  basket merging, or any change to checkout/payment/delivery.
- Restoring a prepared provider submission, retrying an uncertain write, or
  treating Local basket recovery as approval to add to Nemlig.
- Changing the #272/#274 UI contract while those PRs remain under review.
- Guessing a provider fan-out limit before a bounded reproduction identifies the
  failing stage.

## Decisions

### 1. Use owner-keyed Durable Object storage for a short-lived collection

One Durable Object identity is derived from the authenticated principal. It
stores a collection of Local basket records rather than one global basket:

- `basketId` is opaque and stable; it is never derived from product contents or
  a ChatGPT conversation id.
- A record contains creation/last-activity/expiry timestamps, revision, lines
  (up to 500), local workflow state, and presentation-safe inventory metadata.
- `expiresAt` is `lastActivityAt + 24 hours`. An explicit open, selection, or
  local edit updates `lastActivityAt`; passive chat restoration does not.
- An owner may retain at most 50 baskets. Creating basket 51 silently evicts
  the basket with the oldest `lastActivityAt`, with `createdAt` as a stable
  tie-breaker.
- The object removes expired records on every read/write and schedules its next
  alarm for the earliest expiry. Alarm cleanup is a storage optimization; read
  and write enforcement remains authoritative.

This is smaller and more reliable than an owner-wide list index plus one Durable
Object per basket. It gives serialized owner mutations and a bounded retention
window without a second database or global cleanup worker. The existing retired
PlanStorage Durable Object is not reused.

### 2. Keep ChatGPT identity out of durable ownership; remember selection only when safe

The durable key is the authenticated owner only. Conversation identity is never
an authorization key or storage partition. When the host provides a stable
conversation identifier, it stores that chat's selected opaque `basketId` in the
owner's inventory. A chat without that reliable identifier opens the basket
picker instead of guessing a selection. A supported card carries its opaque
`basketId`; every owner chat can list and select every unexpired basket.

The first inventory UI is deliberately small: UUID, last-active date, and
unique-product count. User-editable or generated human names are deferred.
When a grocery request arrives with a valid selected basket, the assistant
proposes appending to it while offering explicit creation of a new basket.

Retain the current seven model-visible shopping tools. Extend the existing
Local-basket start/update schemas with explicit list, create, select, show, and
delete intents instead of adding another public tool. This preserves host
discovery and permission behavior while making every cross-chat switch visible
and reviewable.

### 3. Keep durable state on the Worker side of the Container boundary

The Container has no broad Durable Object binding. The Worker validates the
authenticated principal before Container wake, exposes a narrow internal
state-command interface, and forwards only validated owner-scoped commands and
snapshots. The Container remains the owner of provider credentials, catalogue
reads, and protected proposal execution; the Durable Object never receives
credentials, cookies, provider headers, or complete request logs.

Alternatives considered:

- Persist from the Container directly: rejected because it weakens the existing
  Worker authentication boundary and couples application state to a provider
  process.
- Use KV: rejected because expiry/select/edit needs serialized, strongly
  consistent owner mutations.
- Persist every review/proposal state: rejected because recovery must not
  restore write authority or uncertain-operation ambiguity.

### 4. Re-establish submission safety after recovery

Persist only local basket membership, quantities, local states, and safe
presentation data. Do not persist a prepared payload, submission id, proposal,
or operation lock as reusable authority. On any recovery where a proposal is not
known live and current, clear local prepared state and require fresh product
validation and exact preparation. An in-flight/uncertain provider mutation stays
fail-closed and directs the user to inspect the real Nemlig basket.

### 5. Diagnose discovery fan-out before fixing it

First add a deterministic recipe-scale reproduction plus privacy-safe telemetry
at the stage boundaries: host tool request, shallow catalogue response, detail
hydration, authentication refresh, deadline/cancellation, and aggregate active
reads per principal. Record counts and normalized error class only; never terms,
product contents, tokens, credentials, or session identifiers.

Use the captured evidence to choose the smallest fix. If aggregate fan-out is
confirmed, add a shared per-principal read coordinator around provider discovery
while retaining per-search detail concurrency. If upstream search failures are
the cause, retain truthful error/partial-result behavior rather than introducing
an unrelated queue or retry loop.

## Risks / Trade-offs

- [A durable basket is mistakenly treated as a durable authorization] → Persist
  no proposal or submission authority; fresh preparation and explicit approval
  remain mandatory after recovery.
- [An old card edits the wrong basket] → Require an opaque basket ID for card
  mutations and return a bounded current snapshot only for that owner/basket.
- [Expiry cleanup misses an alarm] → Enforce activity-based expiry on reads and
  writes, not only in background cleanup.
- [Capacity silently drops a useful basket] → Bound the inventory at 50 as
  explicitly selected, evict only the least recently used record, and show the
  same neutral picker for expired, deleted, or evicted old cards.
- [Cross-chat inventory leaks product data] → Inventory is owner-scoped and
  contains only enough local metadata to distinguish/select baskets; no data is
  exposed across principals or logged.
- [A concurrency change hides the real search cause] → Make the production-like
  fixture and failure-stage capture a hard task prerequisite for any limiter or
  retry adjustment.
- [The stacked UI changes alter the Local basket protocol] → Start from the
  eventual #274 merge SHA, re-read its final protocol and specs, and update this
  plan only if that concrete baseline changes the selected implementation seam.

## Migration Plan

1. Keep this planning PR stacked on #274. After #274 merges, create the
   implementation branch from the resulting `origin/main` SHA.
2. Add Durable Object bindings/migrations and the authenticated state boundary
   behind existing production safety checks. No existing persisted PlanStorage
   data is read, migrated, or deleted.
3. Route new Local basket create/list/select/edit/delete operations through the
   boundary. Existing in-memory conversation drafts receive an explicit
   unavailable/choose-or-create recovery path; they are never silently copied
   into owner storage.
4. Ship with exact-head CI, Worker/Container state readback, refreshed ChatGPT
   metadata, and old/new-chat smoke proof. Rollback is the prior Worker/Container
   release; durable records remain inert and expire within 24 hours of their
   last intentional interaction.

## Deferred follow-up

User-editable labels and generated human-friendly names are deferred. The first
inventory shows a UUID, last-active date, and unique-product count only.
