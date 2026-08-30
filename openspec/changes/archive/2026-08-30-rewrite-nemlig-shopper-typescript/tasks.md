## 1. Establish the Local Package

- [x] 1.1 Record the current upstream `main` SHA and non-recipe CLI/MCP inventory in the implementation notes, and verify it matches the two capability specs.
- [x] 1.2 Replace the `uvx` wrapper package metadata with Node 22 TypeScript build, check, lint, test, smoke, CLI, and MCP entry points; add only Commander, Zod, the official MCP SDK, and the masked prompt dependency; verify `pnpm install --lockfile-only` succeeds.
- [x] 1.3 Add the minimal TypeScript and ESLint configuration plus ignored local credential/build artifacts, and verify `pnpm --filter nemlig-shopper check` accepts the empty module skeleton.

## 2. Implement Credentials and Nemlig Client

- [x] 2.1 Implement environment-first credential loading, masked interactive login inputs, `0700` config directory creation, `0600` credential writes, and logout deletion; verify focused Node tests cover precedence, permissions, malformed files, and non-interactive failure without printing secrets.
- [x] 2.2 Implement the native-fetch Nemlig client with timeout, sanitized errors, host-scoped cookies, login, token/settings/user/timeslot refresh, and request headers; verify mocked tests cover successful/rejected login, multiple response cookies, and session reuse.
- [x] 2.3 Implement gateway search, quick-category fallback, product normalization, and every specified classification flag; verify mocked tests cover nested and flat gateway responses, positive limits, empty/failing search, three-category maximum, and field mapping.
- [x] 2.4 Implement add, view, and clear basket calls plus normalized basket readback after each mutation; verify mocked tests cover quantity validation, exact request payloads, totals, partial-success readback failure, and no automatic mutation retry.

## 3. Implement User Interfaces

- [x] 3.1 Implement `nemlig`/`nemlig-shopper` CLI commands for login, logout, search, add, and cart with concise sanitized output; verify CLI contract tests prove recipe/password/checkout options are absent and add prints the post-mutation basket.
- [x] 3.2 Implement deterministic candidate ranking and the `nemlig-mcp` stdio tools for search, add, view, and clear over the shared client; verify in-memory MCP tests cover tool schemas, tags, clean authentication errors, normalized basket results, and the absence of recipe/order tools.
- [x] 3.3 Add the default-enabled `pick_products` tool and `ui://nemlig/picker.html` resource with its false-value environment gate and structured fallback; verify MCP tests cover tool/resource registration, identical search data, disabled mode, displayed product details, and exact one-item add calls.

## 4. Update the Safe Operating Contract

- [x] 4.1 Update the app README, `AGENTS.md`, and Nemlig skill for the local TypeScript commands, exact mutation proposals, explicit approval, automatic readback, and no recipe/checkout behavior; verify repository search finds no `uvx`, Python prerequisite, recipe command, or password-argument instruction in the app.
- [x] 4.2 Add a package smoke test that launches local CLI help and inspects the MCP surface without credentials or network access; verify `pnpm --filter nemlig-shopper smoke` passes.

## 5. Verify and Deliver

- [x] 5.1 Run focused package lint, build, check, tests, and smoke plus `pnpm exec openspec validate rewrite-nemlig-shopper-typescript --strict --no-interactive`, and resolve every failure.
- [x] 5.2 Run root `pnpm verify`, review the scoped diff for credential or local-artifact leakage, commit the completed change, push the active feature branch, and verify the remote ref equals the reported commit SHA.
