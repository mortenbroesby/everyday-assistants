# Contributing

1. Use the Node.js and pnpm versions in `.tool-versions`.
2. Keep credentials, account data, hosted runtime configuration, and real basket
   data outside the repository. Use synthetic fixtures in tests and examples.
3. Use OpenSpec for non-trivial features or architecture changes.
4. Run `pnpm spec:validate`, `pnpm privacy:check`, and `pnpm verify` before
   opening a pull request.

Repository work never authorizes a Nemlig basket mutation. Preserve the
approval and readback requirements documented in
[`apps/nemlig-assistant/AGENTS.md`](apps/nemlig-assistant/AGENTS.md).
