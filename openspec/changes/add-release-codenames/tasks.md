## 1. Release identity policy

- [ ] 1.1 Add focused failing tests for strict codename parsing, `Alpha` bootstrap, NATO-style advancement, `Zulu` rollover, malformed values, and stale/mismatched candidates; verify the new policy tests fail for the expected missing behavior.
- [ ] 1.2 Implement the minimum codename sequence and manifest identity helpers, then verify the focused policy tests pass without adding a dependency or parallel registry.
- [ ] 1.3 Extend release planning and apply to report and atomically persist current/target version-codename pairs, exclude only its own metadata edit from release classification, and reject a no-release or inconsistent codename change; verify focused agent and version-gate tests cover read-only planning, idempotent apply, concurrent-stale candidates, and non-release merges.

## 2. Reviewed note and publication

- [ ] 2.1 Update the bounded release-note contract to require the exact version and codename in its heading, with legacy reads limited to historical releases; verify focused tests reject missing, excessive, malformed, or mismatched notes before deployment.
- [ ] 2.2 Make GitHub prerelease publication read the exact candidate identity, retain the version-only tag, and use `Nemlig Assistant <version> - <codename>` as the release name; verify publication tests cover success, conflict, post-deployment retry, and no mutation before journal validation.
- [ ] 2.3 Keep the existing exact-SHA deployment journal as the binding between candidate identity and production acceptance, and verify workflow/release tests prove failed, non-release, recovery, and finalization paths allocate or publish no new codename.

## 3. Model-visible deployed identity

- [ ] 3.1 Read and validate the manifest version/codename pair at runtime and prefix the existing MCP instructions with the exact current release identity; verify source, interface, HTTP, and packed-package smoke tests retain the existing title, version, icon, tools, and resources and require no release-info tool call.
- [ ] 3.2 Update feature/release/operations documentation with the version-codename format, first-release bootstrap, non-release behavior, and ChatGPT question example; verify documentation links, strict specs, and privacy checks pass.

## 4. Release and delivery

- [ ] 4.1 Run the release planner, apply the one final semantic version and first codename `Alpha`, author the matching bounded note, and verify the exact candidate passes version and note gates without tagging, publishing, or deploying.
- [ ] 4.2 Run focused tests while iterating, then `pnpm verify`, strict OpenSpec validation, `pnpm privacy:check`, packed-package smoke, and the credential-free production dry run; verify every gate passes and record any inapplicable live checks.
- [ ] 4.3 Review the final diff for unchanged safety/cost controls, commit and push the scoped branch, open one pull request, and verify the remote head and exact-head CI; do not merge or deploy without the separately applicable protected workflow decision.
- [ ] 4.4 After authorized merge, verify exact-main CI and the automatic release path deploy the same version/codename candidate, read back the production MCP identity, confirm the GitHub prerelease tag/target/title/note, then sync and archive the OpenSpec deltas; if deployment does not succeed, leave the codename unpublished and record the recovery state.
