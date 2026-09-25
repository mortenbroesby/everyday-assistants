## Why

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
new durable contracts and design decisions. Non-goals include onboarding,
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
acceptance, replacement and removal never mutate the provider basket. A fresh
approval and verified readback remain mandatory for actual submission.

The owner subsequently requested the generated compact green review mockup,
conversation-scoped ephemeral Basket state without a one-hour expiry, freely
reversible resolution, and discovery tools that do not create repeated widgets.
The owner approved conversation lifetime with explicit Finish shopping; chat-close
cleanup is not claimed because the host exposes no reliable end-session signal.

The owner also requires release completion to include visible, interactive UI in
the connected ChatGPT app. Deployment health alone is insufficient. Refresh and
verify the app metadata, check the exact viewer artifact, and exercise local
review controls before reporting a UI release delivered.
