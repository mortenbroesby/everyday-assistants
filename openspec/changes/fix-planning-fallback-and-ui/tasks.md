## 1. Planning recovery

- [ ] 1.1 Add a focused failing planner/MCP test proving an HTTP 401 escapes per-line discovery, triggers exactly one existing authenticated re-login and whole-plan retry, and returns candidates without mutation; verify the new test fails before production edits.
- [ ] 1.2 Propagate only typed HTTP 401 errors from per-line planning while preserving `discovery_unavailable` for non-auth failures; verify the focused planning and runtime tests pass.
- [ ] 1.3 Add focused coverage proving a second 401 surfaces as a clean failure and never loops; verify login and plan call counts remain bounded.

## 2. Agent-only fallback

- [ ] 2.1 Remove the UI resource association from `plan_my_shopping` while leaving its structured schema and conversational modes intact; verify tool metadata tests show no planner UI and the explicit visual tool still owns the picker.
- [ ] 2.2 Update server instructions and tool descriptions to direct `discovery_unavailable` lines to one `find_groceries` call per normalized line without UI or favourites; verify interface tests assert the exact fallback guidance and read-only annotations.

## 3. Useful explicit picker

- [ ] 3.1 Add focused picker characterization for candidate and zero-result output, including absence of selection, quantity, and preparation controls when no usable candidate exists; verify it fails against the current empty guided-plan UI.
- [ ] 3.2 Delete guided-plan rendering from the shared picker and keep only explicit direct-search cards with product title, concise description when available, approved image when available, package, price, availability, and one preparation action for selectable products; verify focused picker and MCP Apps tests pass.
- [ ] 3.3 Update the README feature set and backlog to describe agent-only planning, explicit visual choice, and the lower-priority polished card-layout follow-up; verify retired or misleading automatic-picker wording is absent.

## 4. Release and live acceptance

- [ ] 4.1 Run OpenSpec strict validation, apply the required Nemlig release version, and run `pnpm verify`; verify every required check passes with no credential or basket fixture leakage.
- [ ] 4.2 Commit, push, open and merge a green PR, then verify exact-head `main` CI before deployment.
- [ ] 4.3 Deploy through the protected Nemlig production workflow and run read-only production acceptance; verify the deployed revision is exact and the basket remains unchanged.
- [ ] 4.4 Re-run the supplied multi-recipe chat; verify `plan_my_shopping` or its direct-search fallback returns current products without rendering the empty picker, and separately verify an explicit visual-choice request renders only usable product cards.
