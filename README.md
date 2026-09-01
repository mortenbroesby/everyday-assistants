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
research, compare, plan, and prepare an action. Anything that changes external
state requires a clear approval boundary and a readback of what happened.

The first assistant makes grocery shopping through Nemlig easier: ask for
favorites, compare products, plan a whole list, inspect the basket, or prepare
an exact basket change for approval.

<a id="start-here"></a>
## 🚀 Start here

This repository currently contains one runnable assistant. See its guide for
example prompts, setup, commands, hosting, and the complete safety contract:

- [Nemlig Assistant](apps/nemlig-assistant/README.md)

For local development, use Node.js 22.23.1 and pnpm 9.15.9:

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
- find and filter your favorites
- turn a grocery list into a structured shopping plan
- compare candidates by price, unit price, discount, package, and preferences
- show what is already covered by your basket
- save and continue plans without trusting stale prices
- inspect the basket and review exact additions, removals, replacements, or emptying it
- expose household-language tools in ChatGPT instead of protocol-oriented names
- work locally from a terminal or conversationally through an MCP client such as ChatGPT

It cannot place an order, check out, or pay. Basket changes use a separate
review/approve/complete flow and are verified afterward.

<a id="design-principles"></a>
## 🛡️ Design principles

- **Useful before powerful** — read, compare, and plan without changing anything.
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

## ⚖️ License

[MIT](LICENSE)
