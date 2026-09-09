## 1. Planning recovery

- [x] 1.1 Add focused failing runtime/MCP tests proving every provider-backed task performs a fresh credential login even when local state says logged in, approved writes authenticate without retry, and that a later planning HTTP 401 escapes per-line discovery, triggers one additional re-login and whole-plan retry, and returns candidates without mutation; verify the new tests fail before production edits.
- [x] 1.2 Authenticate at the shared provider-backed MCP boundaries, and propagate only typed HTTP 401 errors from per-line planning while preserving `discovery_unavailable` for non-auth failures; verify focused planning, runtime, and MCP tests pass.
- [x] 1.3 Add focused coverage proving a second post-login 401 surfaces as a clean failure and never loops; verify login and plan call counts remain bounded to two logins and two plan attempts.

## 2. Agent-only fallback

- [x] 2.1 Remove the UI resource association from `plan_my_shopping` while leaving its structured schema and conversational modes intact; verify tool metadata tests show no planner UI and the explicit visual tool still owns the picker.
- [x] 2.2 Update server instructions and tool descriptions to direct `discovery_unavailable` lines to one `find_groceries` call per normalized line without UI or favourites; verify interface tests assert the exact fallback guidance and read-only annotations.

## 3. Useful explicit picker

- [x] 3.1 Add focused picker characterization for candidate and zero-result output, including absence of selection, quantity, and preparation controls when no usable candidate exists; verify it fails against the current empty guided-plan UI.
- [x] 3.2 Delete guided-plan rendering from the shared picker and keep only explicit direct-search cards with product title, concise description when available, approved image when available, package, price, availability, and one preparation action for selectable products; verify focused picker and MCP Apps tests pass.
- [x] 3.3 Update the README feature set and backlog to describe agent-only planning, explicit visual choice, and the lower-priority polished card-layout follow-up; verify retired or misleading automatic-picker wording is absent.

## 4. Release and live acceptance

- [x] 4.1 Run OpenSpec strict validation, apply the required Nemlig release version, and run `pnpm verify`; verify every required check passes with no credential or basket fixture leakage.
- [x] 4.2 Commit, push, open and merge a green PR, then verify exact-head `main` CI before deployment.
- [x] 4.3 Deploy through the protected Nemlig production workflow and run read-only production acceptance; verify the deployed revision is exact and the basket remains unchanged.
- [x] 4.4 Re-run the supplied multi-recipe chat; verify `plan_my_shopping` or its direct-search fallback returns current products without rendering the empty picker, and separately verify an explicit visual-choice request renders only usable product cards.
