## Why

The live `Family Food System` workflow reproduced a false `no_eligible_candidate`: a product found by explicit favourite browsing was rejected when ordinary planning repeated discovery with different wording. The recently tightened nested deadlines also turn slow catalogue responses into missing-product results, making normal grocery planning incomplete even though the service no longer hangs indefinitely.

## What Changes

- **BREAKING** Restore ordinary product planning to current-catalogue search and candidate suggestion instead of automatically searching favourites first.
- Reserve favourite browsing and favourite-based selection for explicit user requests such as “show my favourites” or “add this favourite.”
- Reuse exact products already returned to the user and resolve an explicit selected product by ID without requiring the same text search to succeed again.
- Distinguish unavailable or timed-out discovery from a genuine zero-result search instead of reporting both as `no_eligible_candidate`.
- Let each Nemlig API interaction run for up to roughly one minute, with one final generous end-to-end escape hatch whose sole purpose is preventing an indefinite or multi-minute hang.
- Instruct the calling agent to send short, loose Danish product wording to the Nemlig catalogue search API instead of reconstructed exact titles.
- Preserve authentication, mutation non-retry, basket review and approval, quotas, circuit breaker, dynamic kill switch, one-Container ceiling, and privacy-safe logging.

Non-goals: automatically preferring favourites, silently selecting among multiple catalogue candidates, changing a basket, weakening owner authentication or approval, adding autoscaling, or introducing a paid service.

Acceptance requires reproducing the observed favourite/planner mismatch before the change, proving ordinary planning searches the catalogue with loose wording and without fetching favourites, proving explicit favourite selection remains available, proving search failures remain distinguishable, and showing a stalled hosted call terminates at the final outer ceiling without retrying mutations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-guided-shopping`: Make ordinary multi-line resolution catalogue-first while retaining explicit favourite selection and ambiguity-safe candidates.
- `nemlig-mcp`: Route ordinary product discovery to catalogue-backed planning and reserve favourites for explicit requests.
- `nemlig-cloudflare-hosting`: Replace aggressive nested upstream deadlines with one generous caller-visible ceiling while retaining bounded execution and safety controls.

## Impact

Affected areas include the guided planner, MCP tool guidance and descriptions, exact product reuse, Nemlig client error handling, Cloudflare timeout configuration, focused tests, backlog and operations documentation, and production deployment. No dependency, new service, extra Container, basket mutation, or material cost increase is expected; the existing one-Container and quota ceilings remain unchanged.
