## Why

Nemlig Assistant's ChatGPT tool catalog exposes protocol-oriented names and descriptions such as `prepare_cart_replacement`, `proposal_id`, and "immutable snapshot". The functionality is useful, but the catalog should read like a set of ordinary household shopping actions for an alpha end user.

## What Changes

- **BREAKING**: Replace the current MCP tool identifiers with one concise set of action-oriented identifiers; do not retain duplicate compatibility aliases that would make the catalog larger and more confusing.
- Give every tool a short plain-language title and an outcome-first description that states whether it can change the Nemlig basket or another external system.
- Describe tool inputs in user language while retaining exact machine-readable values required for safe execution.
- Keep the prepare/approve/apply safety boundary, but present it as review followed by the approved action instead of exposing proposal terminology in ordinary catalog copy.
- Remove opaque IDs, expiry details, internal status names, and protocol language from ordinary presentation while preserving them in structured results and troubleshooting paths.
- Add catalog-focused tests, update the README feature inventory, and document that existing clients must refresh or reconnect after the identifier rename.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Require a plain-language ChatGPT tool catalog, friendly input guidance, stable safety annotations, and a deliberate one-time migration from the old protocol-oriented identifiers.

## Impact

- Primary implementation: `apps/nemlig-assistant/src/mcp.ts`, gateway operation classification, production acceptance inventory, and MCP interface tests.
- Documentation: `apps/nemlig-assistant/README.md` and the maintained feature-set inventory.
- Compatibility: installed or cached MCP clients must refresh or reconnect after deployment; old tool identifiers will no longer be advertised.
- Dependencies and cost: no new dependency, service, request path, storage, retry, scaling behavior, or expected operating cost.
- Safety: no change to authentication, approval requirements, basket fingerprint checks, proposal expiry, verified readback, quotas, circuit breaker, timeouts, or kill switch.

## Goals

- Make the tool list understandable without MCP or implementation knowledge.
- Make read-only, local-state, external-write, and basket-changing behavior obvious before invocation.
- Keep one tool catalog rather than exposing old and new names together.

## Non-goals

- Combining distinct tools into a complex multi-action tool.
- Weakening or removing the separate review and approved-action stages.
- Changing product selection, basket behavior, Auth0, hosting, or Cloudflare configuration.
- Adding recipes, checkout, ordering, payment, delivery-slot changes, or family accounts.

## Acceptance Criteria

- Every advertised tool has a plain-language identifier, title, description, and documented inputs.
- Ordinary catalog text avoids proposal, apply, immutable snapshot, UUID, and internal-status terminology.
- Tools that can change the basket or another external system say so clearly and retain correct MCP annotations.
- Catalog tests reject accidental reintroduction of old identifiers or cryptic wording.
- Existing safety, production-readiness, package-smoke, and Cloudflare dry-run checks continue to pass.
