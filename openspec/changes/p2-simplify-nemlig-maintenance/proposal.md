## Why

The previous P2 maintenance change is complete at `7245d096`; another general cleanup would repeat it. Remaining concrete opportunities are custom release-argument parsing despite an installed parser, regex-based product HTML conversion, permissive shopping-list output schemas, and a coverage command with no app coverage task.

## What Changes

- P2: replace release-agent argument parsing with the already installed `commander`, preserving valid invocations and explicitly testing malformed inputs and `--no-release` semantics.
- P2: evaluate and adopt `html-to-text` for bounded product descriptions and attribute text, replacing the HTML-stripping regex after fixture and package-cost checks.
- P2: make the existing coverage command produce a real report and establish a measured baseline using the existing Node test runner.
- P2: replace shopping-list `z.any()` output contracts with explicit public schemas using installed Zod, without exposing stored owner metadata.
- P2: reconcile stale backlog completion claims against implementation and acceptance evidence. Preserve outstanding human and production acceptance tasks.
- Document ordered epics, stories, uncertainty checks, design-pattern choices, and separately scoped P3/P4 improvements in `design.md` and `tasks.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: add bounded plain-text product evidence and explicit shopping-list response contract requirements.

## Impact

Primary scope: `apps/nemlig-assistant`, its release tooling, tests, package scripts, and backlog. The repository currently has one assistant package; this is not a monorepo framework migration.

Expected implementation files: `src/client.ts`, `src/client.test.ts`, `release/agent.ts`, `release/agent.test.ts`, `src/mcp.ts`, `src/interfaces.test.ts`, app `package.json`, and relevant documentation. Inspect callers before changing this scope. `html-to-text` is the only proposed new runtime dependency; Commander and Zod already exist. No dependency is installed by this planning change.

### Goal and acceptance

Deliver simpler maintained boundaries and truthful verification: valid release commands retain their meaning; descriptions decode entities and omit markup/script/style content within existing output ceilings; list responses have executable public contracts; coverage produces evidence. Each implementation slice must record focused tests, request-count invariants, code/dependency delta, and full required verification before integration.

### Non-goals and cost

No Auth0 replacement, invitation redesign, stored-credential change, new provider requests, parallel basket writes, retry changes, higher capacity, relaxed quotas, cache policy change, public API removal, or generic framework. No plausible material operating-cost increase is expected, subject to the implementation measurements below. HTML parsing adds bounded local CPU and package footprint, so adoption requires measured startup/bundle/runtime evidence; no performance improvement is claimed in advance. CI reporting adds some local/CI work; measure it and avoid duplicate test runs where practical.

### Planning completion

Done for this request means evidence-backed proposal/design/spec/tasks, strict validation, and a committed plan integrated into remote main with CI evidence. Implementation checkboxes remain unchecked until a later apply request.
