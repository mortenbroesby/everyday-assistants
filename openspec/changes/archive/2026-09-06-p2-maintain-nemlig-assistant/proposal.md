## Why

The Nemlig Assistant has grown across safety-critical shopping, authentication, and Cloudflare paths without a deliberate maintainability pass. This change establishes a measured, behavior-preserving refactor program that removes proven accidental complexity, documents only important contracts, and leaves the runtime easier to verify without weakening safety or increasing cost.

## What Changes

- Establish a clean, reproducible baseline before refactoring and keep each slice independently verifiable.
- Delete proven dead code, redundant aliases, duplicate declarations, and repeated implementation patterns where consolidation produces a clear net reduction.
- Improve avoidable hot paths without adding requests, retries, storage, concurrency, services, or dependencies.
- Add focused characterization coverage before changing safety-sensitive internals and use a failing test first for any separately identified behavior correction.
- Add TSDoc only for public contracts, safety invariants, and non-obvious behavior; blanket comment coverage is out of scope.
- Preserve all observable CLI, MCP, package, authentication, proposal, basket, Cloudflare, and cost-control behavior.
- Measure production-code and dependency impact for each slice, and keep the overall implementation net-negative in production code.
- Keep behavior changes, provider actions, basket actions, deployment, architecture replacement, and breaking API cleanup out of this change.

## Capabilities

### New Capabilities

None. This is an internal behavior-preserving refactor and documentation program.

### Modified Capabilities

None. Existing requirements and externally observable contracts remain unchanged.

## Impact

The primary scope is `apps/nemlig-assistant`, including its TypeScript runtime, focused tests, packaging smoke checks, and relevant OpenSpec hygiene. No new dependency, service, storage surface, provider request, production deployment, credential access, or basket mutation is introduced.

Acceptance requires independently reviewed slices, characterization evidence for touched behavior, focused and repository-wide gates, strict OpenSpec validation, a final exact-head verification, and a report of net lines/dependencies removed and deliberately skipped abstractions.
