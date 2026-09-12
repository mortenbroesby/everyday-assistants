## 1. Baseline and build proof

- [ ] 1.1 Refresh the implementation branch from current `origin/main` after the active release-workflow pull request lands, confirm no picker-path overlap, install the frozen lockfile on Node 22.23.1/pnpm 9.15.9, and verify the focused picker/interface baseline passes.
- [ ] 1.2 Record the current picker resource's raw and gzip sizes and add the smallest built-artifact characterization check that proves the existing structured result, JSON-text fallback, empty state, hostile-content, image-policy, and one-choice behaviors before migration.
- [ ] 1.3 Prove an isolated Vite single-file build can emit one complete HTML resource with no bare browser imports or executable network dependency; verify the emitted artifact and stop for design review if custom post-processing or an MCP protocol upgrade would be required.
- [ ] 1.4 Add only the exact tested React, React DOM, stable Effect 3, MCP Apps client, and minimum build-tool versions; verify the frozen install, peer ranges, and license/privacy checks, then checkpoint commit the build proof.

## 2. Functional core and React rendering

- [ ] 2.1 Extract the existing picker payload parser and approved image-origin rule into one browser-safe pure module, reusing Zod without duplicate DTO or Effect schemas; verify focused tests reject malformed content and preserve structured-content-first plus JSON-text fallback.
- [ ] 2.2 Implement one React root for the current loading, empty, rejected, candidate, favorite, pantry, proposal, and error states using native controls and existing CSS variables; verify built-artifact tests preserve keyboard actions, focus visibility, reduced motion, text isolation, image alt/lazy/no-referrer behavior, and all current factual fields.
- [ ] 2.3 Keep selection and quantity state local to the picker and verify a candidate action reflects the exact selected product and positive quantity without invoking a basket tool or silently selecting an alternative.
- [ ] 2.4 Run the React best-practices review against the introduced TSX, remove unnecessary components or abstractions, and checkpoint commit the rendering slice with focused tests green.

## 3. Effect host boundary

- [ ] 3.1 Implement one stable Effect 3 adapter that registers result handling before connection, owns the single MCP Apps `App` session, and exposes plain state to React; verify a result delivered during connection renders through the first session.
- [ ] 3.2 Implement scoped send and disposal behavior so one activation produces at most one outgoing choice message, failure never automatically retries, and unmount/replacement ignores stale completion; verify success, failure, duplicate-click, pending-connect, result-replacement, and unmount cases with a fake local host.
- [ ] 3.3 Confirm the browser adapter sends only the existing conversational choice message and cannot call proposal-apply or basket mutation tools; run the focused safety tests and checkpoint commit the Effect boundary.

## 4. Resource and package switch

- [ ] 4.1 Make the Node MCP resource load the generated HTML beside the compiled entry point while preserving the URI, MIME type, default feature gate, recognized false values, and conversational fallback; verify enabled/disabled resource registration tests pass.
- [ ] 4.2 Remove the inline picker document and unpkg executable origin, retain only approved product-image origins, and verify the built HTML and resource metadata contain no executable CDN, dynamic script injection, `dangerouslySetInnerHTML`, unapproved image origin, analytics, storage, polling, reconnect, or automatic retry path.
- [ ] 4.3 Include the built resource in the declared package and clean tarball installation; verify package contents omit browser source/tests and the installed credential-free MCP server returns the complete resource without repository paths or bare imports.
- [ ] 4.4 Compare final raw/gzip size with the recorded baseline and verified supported-host ceiling, document the measured trade-off in `docs/dependency-landscape.md`, and stop rather than switch if the artifact exceeds that ceiling.

## 5. Integration and delivery

- [ ] 5.1 Run focused picker, interface, MCP safety, and package tests plus `pnpm privacy:check` and `pnpm verify`; record that no Nemlig credentials, provider calls, basket mutations, or deployment mutations occurred.
- [ ] 5.2 Use the existing release planner to select and commit the one package version for the complete epic, add the agent-authored release summary required by the active release workflow, and verify the version gate against current `origin/main`.
- [ ] 5.3 Push the completed epic branch, update the pull request, wait for required exact-head CI, merge through the active ruleset, and verify the remote `main` SHA and eligible release/deployment handoff without bypassing the `nemlig-production` approval boundary.
- [ ] 5.4 After verified integration, sync and archive `adopt-react-effect-picker`, then open the separately scoped agent-artifact routing follow-up recorded in the proposal; verify it starts from the merged `origin/main` and does not alter picker behavior.
