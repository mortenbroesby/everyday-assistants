# Everyday Assistants

Small, focused assistants for everyday tasks, local-first where possible. They
can research and prepare actions, while decisions that change the outside world
stay with the user.

## Start here

[Nemlig Assistant](apps/nemlig-assistant/README.md) is the runnable app in this
repository. Its guide covers setup, example prompts, local use, and hosted use.

For local development, use Node.js 24.13.0 and pnpm 9.15.9:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

## Nemlig Assistant

The unofficial CLI and ChatGPT app can search and compare Nemlig products,
show a local draft list, and review the real basket. Adding to the real basket
requires exact approval and readback. The assistant cannot remove real basket
items, place an order, check out, or pay.

## Development

`pnpm verify` runs lint and build from the repository root. Use `pnpm check`
and `pnpm test` for type checks and tests; run `pnpm spec:validate` when changing
OpenSpec. The [app guide](apps/nemlig-assistant/README.md) has app-specific
commands in its Development section.

[AGENTS.md](AGENTS.md) contains repository instructions for Codex. Skill usage,
validation commands, and update notes are in
[Codex refactoring skills](docs/codex-refactoring-skills.md). The
[agent routing evaluation](docs/agent-routing-evaluation.md) and
[dependency landscape](docs/dependency-landscape.md) hold their respective
research and maintenance detail.

## Principles and status

- Read and compare before changing anything. Preparation is not approval.
- Verify external changes by reading back the result; stop on uncertainty.
- Keep credentials and real account data out of Git.

Everyday Assistants is in alpha. Nemlig Assistant is an unofficial community
project, unaffiliated with Nemlig or OpenAI. The repository is [MIT licensed](LICENSE).
