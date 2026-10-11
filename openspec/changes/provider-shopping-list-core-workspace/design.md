## Context

See proposal.md. The released proof creates a temporary provider list during
submission, but Local basket lines and quantities still live in the Durable
Object. The first applied safeguard in this change removes the hosted
submission fallback to individual real-basket writes.

## Goals / Non-Goals

**Goals:**

- Make native shopping-list transfer the only hosted real-basket write.
- Move workspace line content and quantities to provider lists while retaining
  server-side ownership and one-attempt submission fencing.
- Preserve the real basket's add-only and readback guarantees.

**Non-Goals:**

- Migrating old Local baskets, changing the real Nemlig basket directly, or
  adding a provider retry.
- Deleting the Durable Object before a deployed provider-list workspace passes
  controlled live acceptance.

## Decisions

### A provider-list pair represents To decide and Ready

Use two app-owned lists per workspace: one for To decide and one for Ready.
This preserves the existing product-review semantics without storing duplicate
product lines in Cloudflare. Moving an item changes both lists and confirms
their exact final contents before acknowledging success.

One list for all states was rejected because it loses the meaningful
To decide/Ready boundary. Keeping lines in the existing Durable Object was
rejected because it perpetuates the second business-state system.

### Durable Object becomes a minimal workspace registry

Retain a compact Durable Object record for opaque workspace ID, authenticated
owner binding, provider list IDs, selected conversation metadata, and the
submission fence. It contains no product lines or quantities. This preserves
restart-safe isolation and single-use submission authority without introducing
another secret or persistence system.

Embedding provider IDs in a client token was rejected because it weakens
workspace isolation and requires a new signing-key lifecycle.

### Provider-list transfer is mandatory for real-basket writes

`prepare` creates or verifies the Ready provider list, then `apply` rechecks
that exact list and calls the native list-to-basket endpoint once. If list
support is missing or any verification fails, the operation fails before a
real-basket write. The former per-product addition loop has no hosted fallback.

## Risks / Trade-offs

- [A provider-list mutation response is lost] → read the list before reporting
  success; if exact state cannot be established, mark the workspace uncertain
  and require inspection rather than replay.
- [Moving an item spans two provider lists] → serialize workspace mutations and
  read both lists exactly; do not automatically compensate after an ambiguous
  provider response.
- [Old local baskets become unavailable] → make this explicit at the API/UI
  boundary and require a fresh workspace rather than silently migrating data.

## Migration Plan

1. Ship the list-only submission invariant and endpoint contract test.
2. Add the provider-list workspace registry and provider-backed edit/read path.
3. Switch MCP and viewer operations to the registry, then remove line-content
   storage and the callback route.
4. Run controlled live provider-list workspace and exact transfer acceptance.
5. Only after that evidence, remove the deprecated Local-basket Durable Object
   data model and binding.

Rollback is a source rollback before step 5. It does not replay or migrate
workspaces, and it never retries an uncertain real-basket transfer.
