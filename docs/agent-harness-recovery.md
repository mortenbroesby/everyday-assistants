# Restore the agent harness from a checkout

The repository is the durable source for project instructions. A lost laptop
must not require recovering an old conversation or a home-directory skill to
understand how to work. This guide restores guidance and tooling; it does not
back up private sessions, credentials, unfinished local changes or live drafts.

## Fresh machine checklist

1. Install Git and an agent host, authenticate GitHub through the OS-supported
   flow, then clone the repository. For the owner's SSH setup:
   `git clone git@github.com:mortenbroesby/everyday-assistants.git`.
   Restore SSH access through its normal secure setup; never obtain private
   keys from this repository. Inspect branch/status and fetch current main
   before starting an isolated task branch/worktree.
2. Open the checkout in the agent. Read root `AGENTS.md`, its linked operating
   guidance and the nearest app instructions. Explicitly read these files if
   the host does not automatically discover AGENTS. Local overrides may add
   machine paths/preferences; they must not be the only copy of project rules.
3. For code tasks, install the Node/pnpm versions in
   [Definition of Ready](../.agents/instructions/definition-of-ready.md), verify
   `node --version` and `pnpm --version`, then run
   `pnpm install --frozen-lockfile`. Documentation-only work does not need a
   dependency install unless a selected check requires it.
4. Use the checked-in skills on demand. For Fallow and host hooks, follow
   [Fallow integration](fallow.md) and [hook activation](../.friction/README.md#native-reminder-and-activation).
   Inspect the host's discovered hook source and obtain its normal trust
   approval. A tracked JSON file is not evidence that a hook is active.
   Linked worktrees may load hooks from the main checkout.
5. Configure only the connectors needed for the task through their supported
   host setup. Check actual advertised tools and versions. Missing optional
   indexes permit scoped file search; missing one browser control service
   permits an available authorized fallback. See
   [browser recovery](../.agents/instructions/browser-recovery.md).
6. If sign-in is required, install the official 1Password desktop app/CLI when
   appropriate and follow the scoped authorization rules in
   [operating guidance](../.agents/instructions/operating.md#credential-assisted-sign-in).
   The laptop's optional AppleScript helper is not required to resume work.
7. Recover the task from its GitHub issue/PR: accepted objective, latest SHA,
   completed checks, uncertainty and next action. Revalidate external state.
   Lost process-local drafts and uncertain writes must not be reconstructed or
   replayed. Preserve those outcomes and seek only genuinely missing decisions.
8. Run the relevant checks from Definition of Done. Keep source tests, hook
   activation, browser rendering and live acceptance as separate evidence.

## What Git preserves

| Harness component | Repository source | What must be restored separately |
| --- | --- | --- |
| Workflow, access and preview rules | `.agents/instructions/operating.md`, root/app `AGENTS.md` | Host permissions and machine-specific paths |
| Readiness and completion | `.agents/instructions/definition-of-ready.md`, `definition-of-done.md` | Current task authorization and external state |
| Browser recovery | `.agents/instructions/browser-recovery.md` | Browser installation, dedicated profile and sign-in |
| Specialized skills | `.agents/skills/`, app `.codex/skills/` | Optional host plugin installation/discovery |
| Codex/Fallow hooks | `.codex/hooks.json`, `.agents/hooks/`, `scripts/fallow-agent-hook.mjs`, `docs/fallow.md` | Host trust and verified activation |
| Versions and dependencies | `package.json`, lockfile, runtime files | Installed runtime/package manager |
| Failures and programme state | `.friction/`, linked GitHub issues/PRs, app runbooks | Private evidence and uncommitted work |

Do not copy the entire home-directory harness into Git. Personal memories,
provider profiles, tokens, cookies, vault exports, browser caches, raw support
logs and private chat IDs are not portable instructions. External plugins and
skills can change independently; verify them live rather than treating a
cached package on the old laptop as the authoritative implementation.

## Maintaining the source of truth

Add reusable project rules here and link them from AGENTS. Keep a global
instruction only when it applies across projects or points to this repository;
avoid mirroring rule bodies. Update observed friction with evidence and limits,
not speculative rules. Commit and push completed scoped work so a local disk
failure cannot erase it; merge/deployment retain their separate approval gates.

This recovery guide has been checked against repository paths and the observed
browser recovery. A full clean-machine reinstall has not been performed.
