# Everyday Assistants

<p align="center">
  Practical, safety-first assistants for the everyday jobs that should be easier.
</p>

<p align="center">
  Local-first where possible. Explicit approval before real-world changes. Open source by default.
</p>

<p align="center">
  <a href="#start-here">Start here</a>
  <span> | </span>
  <a href="#whats-here">What's here</a>
  <span> | </span>
  <a href="#design-principles">Principles</a>
  <span> | </span>
  <a href="#development">Development</a>
</p>

---

## Everyday help without surrendering control

Everyday Assistants is a home for small, focused tools that let AI help with
real tasks while keeping the important decisions with the user. Assistants can
research, compare, and prepare an action. Anything that changes external
state requires a clear approval boundary and a readback of what happened.

The first assistant makes grocery shopping through Nemlig easier: search and
compare current products, inspect the basket, or prepare an exact basket
change for approval.

<a id="start-here"></a>
## 🚀 Start here

This repository currently contains one runnable assistant. See its guide for
example prompts, setup, commands, hosting, and the complete safety contract:

- [Nemlig Assistant](apps/nemlig-assistant/README.md)

For local development, use Node.js 24.13.0 and pnpm 9.15.9:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

<a id="whats-here"></a>
## ✨ What's here

### Nemlig Assistant

An unofficial TypeScript CLI and MCP server for safer, more useful grocery
shopping. It can:

- search Nemlig and browse departments
- show richly detailed product results with one display-only presentation
- find and filter your favorites
- compare products by price, unit price, discount, package, and availability
- inspect the basket and review exact additions, removals, replacements, or emptying it
- expose household-language tools in ChatGPT instead of protocol-oriented names
- support invited users connecting their own Nemlig account through a separately authenticated browser page when the operator enables it
- work locally from a terminal or conversationally through an MCP client such as ChatGPT

It cannot place an order, check out, or pay. Basket changes use a separate
review/approve/complete flow and are verified afterward.

<a id="design-principles"></a>
## 🛡️ Design principles

- **Useful before powerful** — read and compare without changing anything.
- **Approval is specific** — preparing an action is not permission to perform it.
- **Verify the result** — external changes are immediately read back.
- **Keep secrets out of Git** — credentials, tokens, cookies, profiles, and real account data stay local or in encrypted provider secrets.
- **Fail closed** — uncertainty stops the workflow instead of guessing or retrying a write.
- **Small, independent assistants** — each app lives under [`apps/`](apps) with its own guide and safety rules.

## 🧪 Project status

Everyday Assistants is in alpha. The Nemlig Assistant is usable by its owner,
but interfaces and deployment details may still change. Nemlig Assistant is an
unofficial community project and is not affiliated with, endorsed by, or
supported by nemlig.com or OpenAI.

<a id="development"></a>
## 🛠️ Development

```sh
pnpm spec:validate
pnpm verify
```

Non-trivial feature and architecture changes use OpenSpec. The
`nemlig-assistant` npm-format package remains private and unpublished; package
ownership and public release are deliberately deferred.

Candidate libraries and their adoption status are tracked in the
[Dependency Landscape](docs/dependency-landscape.md).

### Codex-assisted frontend refactoring

Use **Code Simplifier** for general cleanup and refactoring. Add **Composition
Patterns** for React component, API, or state architecture, and **React Best
Practices** only for a relevant React implementation or performance concern.
Use **Verification Before Completion** before claiming success. Repository
policy and cleanup workflow live in [AGENTS.md](AGENTS.md); the skills provide
specialized guidance.

Example:

> Use $code-simplifier to review <path>. Follow AGENTS.md, identify concrete complexity, preserve behavior, and keep the change scoped. If React component/API/state architecture is involved, also use $vercel-composition-patterns; use $vercel-react-best-practices only for a relevant observed React concern. Use $verification-before-completion before reporting completion.

Do not manually edit generated code. The current app uses TypeScript 5.9.3 and
an inline DOM/HTML view, with no React, Next.js, or Orval integration. The React
skills remain installed for future React work. Inspect the target package and
follow its actual framework versions and architecture.
The Nemlig API manifest
(`apps/nemlig-assistant/nemlig-api.openapi.json`) is maintained as documentation,
not generated client code. Build output under `apps/*/dist/` and coverage output
under `apps/*/coverage/` are generated; the coverage script excludes
`src/**/generated/**`, `src/**/*.generated.ts`, `release/**/generated/**`, and
`release/**/*.generated.ts`.

Validation commands run from the repository root. Choose checks for the changed
surface, and inspect app scripts before selecting a narrower command:

| Check | Command | Working directory |
| --- | --- | --- |
| App lint | `pnpm --filter nemlig-assistant lint` | Repository root |
| App build | `pnpm --filter nemlig-assistant build` | Repository root |
| App types | `pnpm --filter nemlig-assistant check` | Repository root |
| App tests | `pnpm --filter nemlig-assistant test` | Repository root |
| App smoke | `pnpm --filter nemlig-assistant smoke` | Repository root |
| Repository verification | `pnpm verify` | Repository root |
| OpenSpec validation, when applicable | `pnpm spec:validate` | Repository root |

Node and pnpm versions are Node 24.13.0 and pnpm 9.15.9. The current app is
TypeScript with ESLint; no standalone formatter command/configuration or
frontend testing framework is configured. Do not add one for cleanup work.
`pnpm verify` runs the app's lint and build commands. Type-check, test,
coverage, and smoke commands remain available for focused investigation, but
are not merge gates while their Node test-runner processes fail to terminate
reliably. Choose checks for the changed surface; documentation- and
instruction-only changes do not need this application-wide command.

The four selected skills are copied locally under `.agents/skills/`; the
installer lockfile is `skills-lock.json`. Installed upstream revisions:

| Skills | Source | Revision |
| --- | --- | --- |
| `vercel-composition-patterns`, `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| `code-simplifier` | [getsentry/skills](https://github.com/getsentry/skills) | `d18b7aa8ba878354e5c348310230e652f7690f9c` |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers) | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |

Local adaptations: Code Simplifier follows applicable agent files and repository
standards, adds a scoped cleanup sequence and conditional history review for
significant changes with unclear intent, and avoids examples that impose style
rewrites; the Vercel descriptions narrow activation to observed React concerns;
Verification Before Completion matches evidence to the specific claim and
changed scope. Preserve these adaptations when reviewing upstream updates.
The nine repository refactoring and OpenSpec skills were restored from commit
`901d5a93083ac70f46d9a4e4a4c766e9f4ab25c4` (before compaction). Their
historical content is retained with current-policy updates: general cleanup
routes to Code Simplifier, the legacy Code Simplification skill is explicit-only
and follows repository style, OpenSpec explore uses ordinary-work authorization,
and OpenSpec archive requires complete work and the CLI archive command. Review
these local updates when changing the restored skills. The proposed refactoring
eval cases are in [Agent routing evaluation](docs/agent-routing-evaluation.md).
The Sentry and Superpowers root license notices are retained inside their
selected skill directories. The Vercel skills declare MIT in `SKILL.md`; their
upstream repository at the recorded revision has no root `LICENSE` file.
To update skills deliberately, review the upstream changes at the intended
revision before installing; install only these four, inspect copied references
and license notices, and retain the generated `skills-lock.json`. Reapply and
review the local adaptations before accepting changes. No automatic update is configured.
Verify runtime discovery with `/skills` in a fresh Codex session.

## ⚖️ License

[MIT](LICENSE)
