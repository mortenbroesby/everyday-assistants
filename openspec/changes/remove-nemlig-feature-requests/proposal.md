## Why

The owner does not use feature-request submission and explicitly requested its removal. Remove the product surface and its GitHub subprocess/token machinery rather than maintain an unused workflow.

## What Changes

- **BREAKING**: remove CLI `feature-request` and MCP `suggest_an_improvement`, their schemas, callback dependencies and implementation.
- Remove hosted `GH_TOKEN` forwarding/type and runtime GitHub CLI installation; retain host GitHub release/deployment tooling.
- Update interface/packed acceptance, feature documentation and simplification roadmap. Retired calls fail as unknown operations and cannot create issues.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-shopper`: remove the feature-request CLI command.
- `nemlig-mcp`: remove feature-request advertisement and acceptance expectations.

## Impact

Scope: Nemlig CLI/MCP, callers/tests, Worker environment wiring, Dockerfile, package version, docs and matching specs. No replacement workflow, existing issue deletion, credential retrieval/revocation, provider mutation or grocery changes. Host-level `gh` remains necessary for repository release/deployment tooling.

Acceptance: CLI help and all MCP configurations omit the removed feature; old calls reject; retained tool inventories match including connection checking; no runtime `gh` subprocess or token forwarding remains; focused tests, full verification, strict specs, privacy and packed smoke pass. Record exact main CI and keep deployment pending unless separately authorized under the operating contract.

Cost: removing a subprocess, runtime package and issue requests cannot plausibly materially increase operating cost. Keep every quota, breaker, deadline and basket safeguard. Rollback is a scoped Git revert and normal reviewed deployment; no stored data migration is needed.
