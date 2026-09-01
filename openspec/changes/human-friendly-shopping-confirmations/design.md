## Context

See `proposal.md` for motivation. Today `success()` serializes the complete
result into both MCP text content and `structuredContent`. That makes exact
protocol data available, but it also encourages ChatGPT and the picker to show
UUIDs, IDs, timestamps, and raw field names. The picker currently parses the
JSON text content, so changing that text without moving the picker to structured
data would break its prepare/apply flow.

## Goals / Non-Goals

**Goals:**

- Give basket view, prepare, and apply tools short Danish-friendly shopping text.
- Preserve the existing structured schemas and every proposal/apply invariant.
- Keep the picker working from the same structured results.
- Prove with focused tests that ordinary text is clean and structured data is
  still exact.

**Non-Goals:**

- Reformat unrelated search, planning, or feature-request results.
- Add localization infrastructure or a rendering dependency.
- Infer whether unlike products are equivalent or suppress material comparison
  data.
- Change Cloudflare, Auth0, quotas, retries, proposal lifetime, or persistence.

## Decisions

### 1. Use MCP's existing text and structured result channels

Extend the existing success-result helper with an optional text presentation.
Basket tools provide friendly text; all other tools retain the current JSON text
by default. `structuredContent` remains unchanged and continues to satisfy the
declared output schemas, production acceptance, proposal application, and
programmatic clients.

Alternative: remove technical fields from tool outputs. Rejected because apply
requires the opaque proposal ID and production acceptance must compare the exact
review.

Alternative: rely only on server instructions and leave raw JSON as text.
Rejected because clients can surface tool text directly and the current picker
does so.

### 2. Keep formatting operation-specific and small

Use a few pure formatting functions next to the MCP result helper. Use the
platform `Intl.NumberFormat` for Danish kroner. Addition summaries show
quantity, name, line total, and package only when multiple lines share a name or
the package is otherwise needed to distinguish them. Replacement summaries show
both package descriptions and the signed basket-cost change. Removal and clear
summaries list the affected basket lines and totals. Apply summaries describe
the verified basket outcome without proposal lifecycle fields.

Alternative: add a generic presentation model or templating library. Rejected;
four fixed basket operations do not justify either.

### 3. Move the picker from JSON text parsing to structured content

The embedded picker SHALL prefer `structuredContent` for tool calls and tool
result events, with its existing JSON-text reader retained only as a compatibility
fallback for non-basket results. Its visible proposal and verification copy uses
the same human-friendly rules: no product IDs or expiry timestamp in ordinary
cards, while it keeps the proposal ID only in local JavaScript state for apply.

Alternative: keep technical JSON text solely for the picker. Rejected because
that would preserve the confusing ChatGPT presentation this change addresses.

### 4. Reinforce presentation rules in server metadata

Update the server instructions and affected tool descriptions to tell models to
use the concise text, avoid repeating internal fields, and ask once for approval
unless the unchanged details were explicitly approved already. This is guidance
only; the server-enforced proposal, owner binding, expiry, lock, revalidation,
single use, and readback remain authoritative.

## Risks / Trade-offs

- [A client ignores text and renders all structured fields] → Keep identifiers
  non-secret, add clear server guidance, and verify the supported ChatGPT app;
  do not remove protocol data needed for safety.
- [Friendly wording hides a material distinction] → Always show package and
  price comparison for replacements and show package when same-name additions
  need disambiguation.
- [Picker breaks when text is no longer JSON] → Migrate it to
  `structuredContent` in the same change and retain a compatibility fallback.
- [Formatting drifts from exact numeric data] → Derive every displayed value
  from the same structured result and cover all four operations with tests.

## Migration Plan

1. Add focused failing presentation tests without changing production state.
2. Implement optional friendly text and migrate the picker to structured data.
3. Update instructions, README examples, feature inventory, and package version
   according to the existing release policy.
4. Run package and repository verification, then deploy through the existing
   bounded Cloudflare process only under the standing production workflow.

Rollback is a normal Git and immutable Cloudflare deployment rollback. No data
migration, secret rotation, or provider configuration change is required.
