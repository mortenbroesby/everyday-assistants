# Codex PATH shim prevents a version check
- Date: 2026-11-27
- Scope: developer harness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 15d7e3c
- Paths: .tool-versions, docs/agent-routing-evaluation.md
- Category: environment
- Severity: medium
- Status: open

## Observation and evidence
During hook capability discovery, `which -a codex` returned an asdf shim before
the bundled CLI. Both `codex --version` and `codex --help` returned
“No version is set for command codex” and suggested Node 22.23.1. Invoking the
official ChatGPT-bundled CLI directly returned `codex-cli 0.169.0-alpha.11.1`.
The repository requires Node 24.13.0; its runtime was not changed.

## Impact
Two intended inspection commands failed. One direct bundled-CLI check recovered
version evidence. Time, tokens and historical recurrence were not measured.

## Hypothesis
The PATH shim resolves an installation associated with a different asdf Node
version. Confidence: medium; the installation was not modified or fully audited.

## Improvement and validation
Verify executable resolution before debugging unavailable CLI capabilities.
Investigate a durable local installation fix separately; do not change project
Node requirements to accommodate the shim. Compare the same version/help checks
under the repository's required Node runtime after any fix.

## Resolution
Workaround verified for this audit; underlying PATH issue remains open. No
credentials, global installation or machine configuration was changed.
