## 1. Baseline and diagnostic gate

- [ ] 1.1 Keep this planning PR stacked on #274. After #274 merges, create the implementation branch from the resulting `origin/main` SHA, re-read the final Local basket protocol/UI changes, and verify the branch contains that exact baseline before changing product-review code.
- [ ] 1.2 Reproduce recipe-scale product discovery with a deterministic fixture that controls shallow-search, detail-hydration, authentication, deadline, and cancellation outcomes; verify it distinguishes successful empty results, unavailable detail rows, and whole-search errors.
- [ ] 1.3 Add privacy-safe aggregate discovery diagnostics (stage, normalized error class, and active-read counts only) and a focused test proving no catalogue contents, credentials, or session identifiers are emitted.
- [ ] 1.4 Run the controlled production-like read-only trace for the reported multi-search behavior, inspect the exact failure stage, and record the evidence in the PR before selecting any global fan-out limit or retry change.
- [ ] 1.5 Implement only the search reliability change supported by task 1.4 (if one is needed), preserving verified partial results and add focused regression tests for the observed failure mode.

## 2. Durable Local basket state

- [ ] 2.1 Define and test the owner-scoped Local basket record, UUID, revision, 500-line validation, 50-basket cap, LRU eviction, and intentional-activity `lastActivityAt + 24h` expiry semantics.
- [ ] 2.2 Add the dedicated owner-keyed Durable Object binding, storage migration, earliest-expiry alarm, and lazy expiry enforcement; verify restart recovery, expiry on read/write, LRU tie-breaking, alarm cleanup, and no access across owners.
- [ ] 2.3 Implement the narrow authenticated Worker-to-Container state interface and verify unauthenticated requests never reach persistence or the Container, while the Container receives no Durable Object capability or credential-bearing state.
- [ ] 2.4 Route successful Local basket create/read/update/delete operations through durable storage with serialized revisions; apply delayed edits to current state only when their target remains unambiguous, otherwise refresh/fail safely, and never partially persist.
- [ ] 2.5 Add explicit recovery handling that clears non-durable prepared/submission authority after restart and verify no recovered Local basket can apply or retry a prior provider operation.
- [ ] 2.6 Commit the persistence boundary as a checkpoint after focused state, expiry, isolation, and recovery tests pass.

## 3. Conversation and viewer interaction

- [ ] 3.1 Extend the existing model-visible Local basket start/update contracts with explicit list, create, select, show, and delete intents without adding a new public shopping tool; remember a selection only for a stable host conversation identifier and otherwise show the picker.
- [ ] 3.2 Update server instructions, structured/text fallbacks, README inventory, and product language from Draft list to Local basket; verify the real Nemlig basket remains unmistakably distinct.
- [ ] 3.3 Update the shared viewer with a compact picker (UUID, last-active date, unique-product count) as the no-selection/unavailable landing state and from the top-right overflow; propose append versus create on new grocery requests, require confirmation for manual deletion, and expose no implicit real-basket action.
- [ ] 3.4 Add Storybook/fixture coverage for inventory, second-chat selection, unstable-chat fallback, activity refresh versus passive restoration, expiry/eviction/deletion landing state, restart recovery, partial search outcome, unavailable viewer, and prepared/uncertain safety states.
- [ ] 3.5 Commit the conversational/viewer integration checkpoint after focused MCP, viewer, accessibility, and browser smoke tests pass with zero provider writes.

## 4. Safety, integration, and release evidence

- [ ] 4.1 Exercise end-to-end local fixtures for owner isolation, 500-line rejection, 50-basket LRU eviction, activity-based 24-hour expiry, explicit deletion, container restart, cross-chat selection, stale-card recovery, partial discovery results, and no automatic retry after uncertainty.
- [ ] 4.2 Run relevant repository verification on Node 24.13.0: app tests, type checking, linting, built-viewer/Storybook checks, `pnpm verify`, OpenSpec validation, and the applicable production acceptance checks; inspect actual output.
- [ ] 4.3 Reconcile the branch with current `origin/main`, create one focused PR on the post-#274 baseline, and include the discovery diagnosis, chosen reliability remedy, retention behavior, and rollback limitations in the PR description.
- [ ] 4.4 After exact-head CI and the active ruleset pass, verify deployment readback, refresh the ChatGPT app tools, and perform read-only old-chat and fresh-chat smoke tests: create/list/select/edit/delete Local baskets and confirm a restored basket requires fresh submission preparation.
- [ ] 4.5 Complete the final version, integration, and deployment sequence with checkpoint commits preserved; report separately which Local basket paths passed, whether the 37-search cause was reproduced, and any remaining production limitation.
