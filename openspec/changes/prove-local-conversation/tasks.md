## 1. Local acceptance
- [x] 1.1 Connect a native two-turn conversation to a synthetic MCP fixture and observe the selected review.
- [x] 1.2 Render the actual result in the built widget and verify a quantity edit persists on the same draft.
- [x] 1.3 Add the opt-in loopback provider check with sanitized stage reporting.
- [x] 1.4 Document commands, prerequisites, coverage limits and verification results.

## Verification evidence

- The scripted fixture-to-widget control passed in headless Chrome. The displayed oat drink quantity changed from one to two, exact-draft MCP readback confirmed two, and the fixture reported zero forbidden operations.
- Eight focused checks passed across the provider contract and Worker configuration, including an empty basket, failure-stage redaction, and local/EU namespace selection.
- The real-account profile requires operator sign-in. Its live provider calls and native ChatGPT acceptance were not exercised in this change.
- NEM-CHATGPT-001 remains **NOT RUN** for the installed ChatGPT catalog. NEM-CHATGPT-006 is **PASS** for the local keyboard row-action and quantity edit only. NEM-CHATGPT-002 through 005, 007 and 008 are **N/A** to this successful draft-edit scenario (recovery, submission, replacement or localization).
