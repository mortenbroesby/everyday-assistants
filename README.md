# Everyday Assistants

Open-source, local-first assistants for everyday tasks. The repository is a
pnpm/Turborepo monorepo and currently contains one app:

- [`apps/nemlig-assistant`](apps/nemlig-assistant) — a TypeScript CLI and MCP
  server for product discovery and explicitly approved Nemlig basket changes.

Nemlig Assistant is an unofficial community project. It is not affiliated with,
endorsed by, or supported by nemlig.com or OpenAI.

## Development

Use Node.js 22.23.1 and pnpm 9.15.9:

```sh
pnpm install --frozen-lockfile
pnpm spec:validate
pnpm verify
```

The repository includes OpenSpec for non-trivial feature and architecture
changes. Credentials, cookies, tunnel profiles, account data, and real shopping
state must remain outside Git.

## Distribution

The `nemlig-shopper` npm-format package remains private and unpublished. npm
publication, package-name ownership, trusted-publisher configuration, tags, and
release automation are deferred external decisions.

## License

[MIT](LICENSE)
