## 1. Provider-backed editing

- [x] 1.1 Add focused regressions proving create-on-selection, no basket writes, exact native edits, and restart reopening; distinguish the observed live reload failure from locally reproduced failures and passing post-change checks.
- [x] 1.2 Replace the public transient draft/manual Save/Update flow with native creation and immediate persisted edits; verify account identity, concurrent changes, partial/uncertain recovery, and no duplicate creation in service/MCP tests.
- [x] 1.3 Align MCP input/output schemas, tool guidance and mutation annotations; verify retired draft inputs reject without provider mutation and search/picker remain read-only.

## 2. Viewer and user-facing guidance

- [x] 2.1 Remove everyday Save/Update controls and unsaved-draft states; verify quantities, replacements, removal, and empty native-list rendering in focused viewer tests.
- [x] 2.2 Refresh exact native list on remount before enabling controls; browser smoke must prove edited contents replace original host output, and missing/network failure preserves context with recoverable feedback and no replay.
- [x] 2.3 Update Storybook, plugin guidance and app README; inspect examples for one native list model and separate explicit basket submission.

## 3. Integration and handoff

- [x] 3.1 Run focused affected tests, fast pnpm verify, changed-file formatting, OpenSpec strict validation and relevant browser artifact smoke; record results and skipped live checks.
- [x] 3.2 Inspect final diff for stale draft consumers, accidental provider authority, unnecessary abstractions and unhandled uncertainty; resolve supported findings before commit/push and one PR.

Production merge/deployment and an exact-authorized live native-write acceptance are subsequent delivery steps, not claimed by these local checks. The app package version is unchanged; the private plugin bundle advances to 0.1.6 so its updated prompt and shopping instructions can be installed separately.
