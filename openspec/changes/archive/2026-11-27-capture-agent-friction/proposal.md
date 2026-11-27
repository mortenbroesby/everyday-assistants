## Why
Observed checkout drift and CLI resolution failures lack a general developer-friction record. Existing Nemlig incident and developer evaluation records should be connected, not duplicated.

## What Changes
- Add a sanitized, version-controlled friction ledger with resolution history.
- Route capture during work and handoff through concise lifecycle guidance.
- Add nonblocking native completion/interruption reminders with no transcript access or record generation.
- Extend existing evaluation guidance with comparable-task scenarios and explicit unknowns.

Acceptance: meaningful records have evidence and validation plans; no record is mandatory; reminders never block, retry or write data. Tests prove mechanics, not improved agent behavior.
Non-goals: telemetry, transcript mining, automated instruction changes, dashboards, new dependencies, merge or deployment.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `agent-workflow`: factual friction capture and advisory lifecycle reminders.

## Impact
Issue #370, branch `codex/agent-friction-loop`, one draft PR. Changes are limited to developer guidance, hook configuration/script/tests and `.friction/`. Existing production learning remains canonical in the Nemlig compendium. No production assistant behavior changes.
