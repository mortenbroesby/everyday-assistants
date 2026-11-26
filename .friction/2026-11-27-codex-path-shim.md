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

## Shared-friction evaluation follow-up
On 2026-11-27, one read-only trial each on baseline `15d7e3c` and candidate
`81210fd` reproduced the PATH failure (exit 126). Both gpt-6-astra runs used
three tool calls, recovered by explicitly invoking the CLI installed under
Node 22.23.1, and verified that separate installation as codex-cli 0.145.0.
Neither changed project runtime requirements. The candidate received the
ledger-routing instruction but did not read this record; no prior-learning
reuse or failed-operation reduction was observed. Both provided factual final
limitations. The full prompts, metrics and confounders are in
docs/agent-routing-evaluation.md. The direct bundled 0.169.0-alpha.11.1
workaround remains separately verified; no global environment fix was made.
