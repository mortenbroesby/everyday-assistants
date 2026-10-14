# Codex refactoring skills

[AGENTS.md](../AGENTS.md) and the nearest app instructions define repository
policy. Skills add task-specific guidance; their generic examples do not expand
the task or override repository rules.

## Use

| Need | Skill |
| --- | --- |
| Simplify existing code or remove accidental complexity | [Code Simplifier](../.agents/skills/code-simplifier/SKILL.md) |
| Improve a React component API, composition, or state ownership | [Composition Patterns](../.agents/skills/vercel-composition-patterns/SKILL.md) |
| Address a concrete React rendering, data-flow, or performance concern | [React Best Practices](../.agents/skills/vercel-react-best-practices/SKILL.md) |
| Check evidence before claiming implementation is complete | [Verification Before Completion](../.agents/skills/verification-before-completion/SKILL.md) |

For example:

> Use $code-simplifier to review <path>. Follow AGENTS.md, identify concrete complexity, preserve behavior, and keep the change scoped. If React component/API/state architecture is involved, also use $vercel-composition-patterns; use $vercel-react-best-practices only for a relevant observed React concern. Use $verification-before-completion before reporting completion.

## Repository fit and checks

The Nemlig app currently uses TypeScript 5.9.3, React 19.2.3, and Vite 7.3.6.
It does not use Next.js or Orval. Its
[`nemlig-api.openapi.json`](../apps/nemlig-assistant/nemlig-api.openapi.json)
documents the observed API; it is not generated client code. Do not manually
edit generated output under `apps/*/dist/` or `apps/*/coverage/`. The coverage
script also excludes `src/**/generated/**`, `src/**/*.generated.ts`,
`release/**/generated/**`, and `release/**/*.generated.ts`.

From the repository root, `pnpm verify` runs fast lint only (no build, formatting,
TypeScript check, or tests). Commits check staged whitespace and run the pinned
Fallow audit with `--gate new-only`; pushes run fast lint. The audit reports
changed-code findings relative to the upstream merge-base (or `main` without an
upstream), not an isolated staged-index snapshot. It still builds the project
graph and may analyze the base revision to distinguish introduced findings.

The required CI `verify` job retains OpenSpec/privacy checks, lint,
formatting, build, type checks, all tests, package/Cloudflare checks, dead-code
regressions, and browser smoke. A green local command does not establish a green
build or correct behavior; inspect CI on the exact PR head before merge.

For behavior changes, run the relevant tests and direct consumers locally using
the existing Node/tsx runner, for example from the repository root:

```sh
pnpm --dir apps/nemlig-assistant exec tsx --test src/read-coordination.test.ts
```

Choose files from imports, callers, and affected contracts; filename matching
alone is not test-impact analysis. Run broader checks locally only for a concrete
risk or to reproduce a CI failure. Existing `pnpm check`, `pnpm test`, `pnpm build`,
`pnpm lint`, and `pnpm spec:validate` remain available for that purpose. Format
only changed executable files with `pnpm exec prettier --write <paths>`.
Documentation-only changes do not need application checks. Do not add a new
runner or automatic changed-test selector to use this workflow.

## Provenance and updates

The four skills above are copied into `.agents/skills/`. The installer records
them in [`skills-lock.json`](../skills-lock.json). Their upstream revisions at
installation were:

| Skills | Source | Revision |
| --- | --- | --- |
| `vercel-composition-patterns`, `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| `code-simplifier` | [getsentry/skills](https://github.com/getsentry/skills) | `d18b7aa8ba878354e5c348310230e652f7690f9c` |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |

Local adaptations narrow the Vercel skill descriptions to observed React
problems, make Code Simplifier follow repository conventions and scoped cleanup,
and make Verification Before Completion match evidence to the specific claim.
When updating, review the upstream diff and each copied reference, preserve
required notices, reapply and review these adaptations, and retain the updated
installer lockfile. There is no automatic update. Check skill discovery with
`/skills` in a fresh Codex session.

The [agent routing evaluation](agent-routing-evaluation.md) records the
refactoring eval cases and proposed harness improvements.
