---
name: agent-artifact-maintenance
description: Add, rename, retire, or reroute repository-local agent instructions and skills while keeping the agent artifact manifest valid. Use when changing AGENTS.md files, repository skills, instruction documents, or their routing.
license: MIT
---

# Agent artifact maintenance

Keep repository-local agent guidance discoverable, scoped, and consistent. The authoritative inventory and routing registry is `.agents/manifest.json`; `scripts/check-agent-artifacts.mjs` enforces its contract.

## Before changing an artifact

1. Read the root `AGENTS.md`, then the closest scoped `AGENTS.md` for the target path.
2. Inspect the manifest entry, every route that references it, and the validator behavior and tests.
3. Search for links, references, and overlapping guidance. Decide whether the need belongs in an existing artifact before adding another one.
4. Preserve instruction precedence and authority: root guidance applies repository-wide; scoped instructions may specialize it but must not silently weaken safety, approval, verification, or delivery rules.

Do not copy a skill's procedure into `AGENTS.md` or the manifest. Keep root instructions as a concise router, scoped instructions as local constraints, the manifest as inventory and routing metadata, and each skill as the reusable procedure.

## Change workflow

- **Add:** create the smallest repository-local artifact, give it a precise trigger and non-goals, register it in the manifest, and route it only where relevant.
- **Rename or move:** update the path, manifest id or metadata when needed, route references, and all repository links in one change. Avoid compatibility aliases unless a real consumer needs one.
- **Retire:** prove the artifact and its routes are unused or superseded, remove references and the manifest entry, then delete it. Record intentionally deferred migration work rather than leaving a misleading route.
- **Reroute:** change manifest routes and concise router text together. Check that broad triggers do not cause unrelated skills to load and that specific safety instructions still win at their scoped path.

Never edit or install global, user-level, bundled, or plugin-provided skills as part of repository maintenance. Do not copy them into this repository unless the user explicitly approves vendoring and its maintenance cost.

## Verification

Add or update the smallest focused validator test before changing validation behavior. Check at least:

- paths exist and remain repository-relative
- artifact and route ids are unique and route references resolve
- skill frontmatter and manifest metadata agree
- newly discoverable artifacts are registered, and retired ones leave no stale entries
- instruction precedence and authority boundaries remain explicit

Run the focused tests, `pnpm agent:check`, and the repository's required verification gate. Review the final diff for duplicated policy and accidental scope expansion. Report which artifacts and routes changed; do not claim success from documentation edits alone when validation is red.
