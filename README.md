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
  <span> | </span>
  <a href="#documentation">Documentation</a>
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
- show product results in a React viewer
- find and filter your favorites
- compare products by price, unit price, discount, package, and availability
- inspect the basket and prepare exact, add-only changes for approval
- expose household-language tools in ChatGPT instead of protocol-oriented names
- support invited users connecting their own Nemlig account through a separately authenticated browser page when the operator enables it
- work locally from a terminal or conversationally through an MCP client such as ChatGPT

It cannot remove, decrease, replace, or clear real basket items, place an
order, check out, or pay. Additions use a separate review/approve/complete
flow and are verified afterward.

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

### Codex-assisted frontend refactoring

Use **Code Simplifier** for general cleanup, **Composition Patterns** for
React component structure, and **React Best Practices** for concrete React
implementation or performance concerns. Use **Verification Before Completion**
before claiming success. [AGENTS.md](AGENTS.md) defines repository policy;
[Codex refactoring skills](docs/codex-refactoring-skills.md) covers usage,
validation commands, provenance, and deliberate updates.

## 🧪 Evidence, Not Promises

The Nemlig app has synthetic browser smoke tests and a UI benchmark for startup
and review flows. Those measurements are advisory; they do not replace testing
in ChatGPT. The [app guide](apps/nemlig-assistant/README.md) explains the method
and its limits.

<a id="documentation"></a>
## 📚 Documentation

- [Nemlig Assistant guide](apps/nemlig-assistant/README.md) — setup, shopping flows, and safety boundaries
- [Codex refactoring skills](docs/codex-refactoring-skills.md) — usage, validation, and updates
- [Agent routing evaluation](docs/agent-routing-evaluation.md) — refactoring cases and harness findings
- [Dependency landscape](docs/dependency-landscape.md) — candidate libraries and adoption decisions
- [Cloudflare operations](docs/cloudflare-operations.md) — hosted-service operations

## Requirements

Local development uses Node.js 24.13.0 and pnpm 9.15.9. The Nemlig package is
private and unpublished; follow its [app guide](apps/nemlig-assistant/README.md)
for CLI, MCP, and hosted setup.

## ⚖️ License

MIT. See [LICENSE](LICENSE).

## 🙏 Acknowledgements

- `pnpm`, `Turborepo`, `TypeScript`, `React`, and `Vite` for the workspace and UI foundation
- the Model Context Protocol ecosystem for a common assistant integration surface
- the open-source maintainers whose work makes this project possible

---

## 👤 Author

**Morten Broesby-Olsen** (mortenbroesby)

- GitHub: [@mortenbroesby](https://github.com/mortenbroesby)
- LinkedIn: [mortenbroesby](https://www.linkedin.com/in/morten-broesby-olsen/)

---

<p align="center">
  Made with ☕ and ⚡️ by Morten Broesby-Olsen
</p>
