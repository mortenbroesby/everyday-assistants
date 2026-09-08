# Removal evidence

## Readiness and scope

- User explicitly selected feature-request removal after the product roadmap; no replacement is wanted now.
- Reused this task's isolated worktree and branch, clean at remote main `c427b3ac197d06b2cf77b65b63bfa7a038dea7b2`. Primary checkout and other worktrees untouched. Relevant sibling tasks were idle at inspection.
- jCodeMunch located four feature-module importers and the CLI/MCP/test wiring. Filesystem inspection covered Docker/configuration, non-indexed Markdown and exact edits. No measured token savings claimed.
- Reviewed proposal, design and delta scenarios before implementation. This request explicitly authorizes removal; it supersedes the proposal skill's default planning-only stop for this scoped change.
- Terra owns runtime and interface/packaged checks; coordinator owns documentation, package metadata, Docker and OpenSpec; Luna reviews that latter scope read-only.
- Removal reduces potential issue requests and runtime package surface; no new service, retry, storage, concurrency, capacity or material cost increase. All grocery and admission safeguards remain.
- GitHub issue history, host-level GitHub CLI and provider-held credentials are not modified. Runtime stops forwarding the optional GitHub token. Provider deployment requires separate current authority under the operating contract.

## Validation

- Red: before production edits, the two retired CLI/MCP tests failed because the command was accepted and the tool was advertised. Fakes prevented external issue or basket writes.
- Green: 37 focused interface/smoke/config tests passed, including Apps on/off inventories and authenticated principal-context callers. Packed package smoke passed after changing its stale positive CLI expectation to a negative assertion; four config tests passed, including no runtime GitHub token forwarding.
- Full pnpm verify passed 207 tests plus three smoke tests. The initial readiness invocation then failed only on the stale packed CLI expectation; corrected and final readiness re-run is recorded below.
- Coordinator reviewed implementation removal and positional HTTP context shift; Luna reviewed README/Docker/version/docs. Three stale hosting GitHub prerequisites/cost references were corrected. CA certificates and host release/deployment tooling remain.
- Version `3.0.0-alpha.15` passes the existing major-bump policy. No runtime gh subprocess, feature module importer or token forwarding remains; only explicit negative tests and historical documentation retain those identifiers.
- jCodeMunch helped retrieve callers and agent refreshed affected source files; no measured savings. A later bulk refresh encountered duplicate local/Git index identity, so no claim of successful bulk refresh.
- User raised broader shopping-list removal during this work. Clarification is pending; this change does not remove saved plans, named lists or stored records.
- Production and final archive remain pending separate provider authority.

- Final `pnpm nemlig:production:ready` passed: 16 strict spec checks, privacy, full verification, packed smoke and credential-free Wrangler dry-run including the reduced Docker image build. Running that image confirmed `gh` absent and CA certificates present. No live deployment occurred.
