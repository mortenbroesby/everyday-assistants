# Fallow integration

Fallow is pinned to **3.49.0** in the root package and lockfile. Install with
Node 24.13.0 and `pnpm install --frozen-lockfile`; Husky activates the tracked Git
hooks. No global Fallow installation is needed.

## Local and CI gates

- Commits check staged whitespace and run the pinned changed-code audit.
- Pushes repeat the audit and run `pnpm verify` (fast lint).
- Both audit against `origin/main`, including uncommitted changes. Fetch before
  starting work. For another integration branch, set `FALLOW_AUDIT_BASE` to that
  branch's remote ref. The audit is not an isolated staged-index check.
- The CI `fallow` job gates every PR against its exact target SHA, and every main
  push against its previous SHA. Its report appears in the job summary. New
  findings fail; inherited findings remain context. CLI/setup failures also fail.
- Required CI `verify` fails if the Fallow job fails, is cancelled, or is skipped;
  the existing branch ruleset therefore enforces Fallow without a ruleset change.
- CI `verify` retains the full build/type/test/smoke suite and the separate Nemlig
  dead-code check against the **target branch's** committed baseline. Editing a
  PR's baseline cannot hide a regression. Never regenerate it to accept new debt.

The audit covers dead code, complexity, duplication, and styling. Existing rule
severities remain: unused development/optional dependencies are errors; styling
warnings remain advisory. Default complexity and duplication thresholds are
retained. Fallow evidence never independently authorizes deletion or a refactor.

```sh
pnpm fallow:audit --base origin/main
pnpm fallow:review --base origin/main --brief
pnpm fallow:check --format json --quiet
pnpm fallow:health --hotspots --targets --format json --quiet
pnpm fallow:dupes --format json --quiet
pnpm fallow:status --format json --quiet
```

Full scans may return 1 for existing findings. Preserve exit status and inspect
`gate_outcomes`; do not hide failures with `|| true`. Local Impact tracking is enabled in this checkout (it is separate from telemetry).
Other checkouts can opt in with `pnpm exec fallow impact enable`. Cache and local reports
belong in ignored `.fallow/`. The existing baseline is under `.code-health/`.

## Codex, skills, and MCP

The repository includes the upstream `fallow` and `fallow-setup` skills,
AGENTS.md routing, `.codex/config.toml` MCP registration using `pnpm exec`, and
an upstream commit/push gate. `scripts/fallow-agent-hook.mjs` adapts Codex's
`cmd`/`workdir` payload to the upstream Bash protocol. It preserves the existing
JCodeMunch hook. The upstream shell gate handles command classification and
writes local diagnostics under `.fallow/`.

**Activation:** trust this project's hook in Codex `/hooks`, and reload the
project/session to discover its MCP server. Tracked configuration alone is not
proof that a running session has loaded either. Git hooks and CI remain active
independently. Upstream agent-hook runtime errors are advisory (fail open);
Git hooks and CI propagate CLI failures and provide the enforcing gates.

To refresh generated wiring after an upgrade, first inspect:

```sh
pnpm exec fallow agent install --harness codex --dry-run --format json --quiet
pnpm exec fallow hooks status --format json --quiet
```

The installer may label adapted skills/MCP as `foreign` and the wrapped hook as
`absent`; inspect `.codex/hooks.json` and test the adapter rather than replacing
these owned integrations merely to change the status label.

Preserve the payload adapter, pnpm MCP command, local skill guidance, and existing
hooks when reviewing installer changes. Skills and the vendored shell gate must
be reviewed alongside the pinned package upgrade. Do not use `--force` to erase
local adaptations. Other agent harnesses can be added explicitly if adopted.

Cloud monitoring, licenses, production coverage capture, and telemetry are not
required for this setup. No account, upload, or paid service is enabled. Security
candidate and type-aware analysis remain available for targeted investigation;
TypeScript, lint, formatting, and security verification retain their own jobs.
