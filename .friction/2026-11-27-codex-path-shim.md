# Codex PATH shim prevents a version check
- Date: 2026-11-27
- Scope: developer harness
- Task: https://github.com/mortenbroesby/everyday-assistants/issues/370
- Revision: 15d7e3c
- Paths: .tool-versions, docs/agent-routing-evaluation.md
- Category: environment
- Severity: medium
- Status: resolved

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

## Initial workaround
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

## Root-cause investigation
A later read-only shell comparison found a second standalone installation:
noninteractive task shell `codex --version` returned 0.162.1 through
`~/.local/bin/codex`, linked to the native standalone package. An interactive
Zsh shell instead resolved the asdf shim. `~/.zshrc` explicitly prepends asdf
shims; its later `~/.local/bin/env` helper adds the local directory only if it
is absent, so it does not restore precedence when that directory is inherited.
`asdf shimversions codex` lists only Node 22.23.1, whereas the repository selects
24.13.0. This is an environment-ordering defect, not a missing repository CLI
implementation. The standalone 0.162.1, bundled 0.169.0-alpha.11.1 and npm
0.145.0 executables are distinct installations.

A controlled shell probe reproduced the inspected PATH initialization without
sourcing private shell configuration. Prepending the existing user bin directory
after asdf selected standalone Codex 0.162.1 while Node still resolved through
asdf to v24.13.0. Only `codex` currently overlaps between the two directories.
A two-line shell configuration patch was prepared locally and user approval
requested because it affects all repositories. It has not been applied; no
package install, global configuration or project runtime change is claimed.
The next check after approval is a fresh interactive shell followed by the same
read-only version task; retain the pre-fix failures rather than rebaseline them.

## Verified resolution on the owner's laptop

After owner approval, the interactive Zsh configuration now gives the existing
standalone Codex installation precedence over the asdf shim. Fresh interactive
and login shells launched in this repository both ran `codex --version` and
`codex --help` successfully. A terminal-backed login shell resolved
`~/.local/bin/codex` and reported Codex 0.162.1, Node v24.13.0 and pnpm 9.15.9.
These checks cover the two original command failures. Longitudinal task time,
token savings and recurrence on other machines remain unmeasured.

The [programme backlog](https://github.com/mortenbroesby/everyday-assistants/issues/365)
tracks follow-up on the next comparable developer task.
