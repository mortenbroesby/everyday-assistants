## Why

The local Nemlig assistant currently shells out to the Python `nemlig-shopper` package, leaving its core shopping and MCP behavior outside this TypeScript monorepo. Rebuilding the current upstream non-recipe feature set locally removes the Python/`uvx` runtime dependency while retaining the repository's explicit approval and credential-safety boundaries.

## What Changes

- **BREAKING**: Replace the `uvx` wrapper with a local Node.js 22 TypeScript implementation.
- Match the current upstream `main` behavior for credential loading/saving, Nemlig session setup, product search and classification, category fallback, basket add/view/clear operations, CLI output, MCP tools, product ranking, and the optional MCP Apps picker.
- Preserve both `nemlig` and `nemlig-shopper` CLI entry points plus the `nemlig-mcp` stdio entry point within the local package scripts/binaries.
- Keep login interactive by default, store credentials locally with owner-only permissions, and never expose credentials in logs or committed artifacts.
- Retain the local safety contract: discovery is read-only; basket mutations require exact user approval and post-mutation basket verification; no checkout/order/payment capability exists.
- Remove all recipe URL/text parsing, recipe dependencies, recipe CLI commands, recipe MCP tools, and recipe documentation.
- Add deterministic tests with mocked HTTP responses; live Nemlig mutation is not part of verification.

### Goal

Provide a local, fully TypeScript Nemlig Shopper with parity to the upstream repository's non-recipe features and the stricter mutation controls already required by this repository.

### Non-goals

- Recipe scraping, ingredient parsing, translation, deduplication, or recipe-to-product matching.
- Checkout, order placement, payment, delivery-slot selection, or unattended basket mutation.
- Compatibility with the upstream Python package's internal APIs or credential file format beyond what is needed for a safe local migration.
- Live mutation tests against the user's Nemlig account.

### Acceptance Criteria

- The local package builds and type-checks under the repository's pinned Node.js/pnpm toolchain without Python or `uvx`.
- Mocked contract tests cover login/session setup, search and fallback, product mapping/ranking, add/view/clear basket calls, credential permissions, CLI commands, MCP tools, and the picker feature flag/resource.
- CLI and MCP expose all current upstream non-recipe behavior and expose no recipe or checkout capability.
- Basket mutation paths enforce the repository approval boundary and always attempt a basket readback after mutation.
- Root `pnpm verify` and strict OpenSpec validation pass without using live credentials or mutating a real basket.

## Capabilities

### New Capabilities

- `nemlig-shopper`: Local TypeScript CLI, API client, credential handling, product discovery, and safely gated basket operations.
- `nemlig-mcp`: MCP tools and optional MCP Apps product picker for the same non-recipe shopping surface.

### Modified Capabilities

None.

## Impact

- Replaces `apps/nemlig-assistant/package.json`, documentation, instructions, and skill references that currently assume the upstream Python CLI.
- Adds TypeScript source, focused tests, compiler/lint configuration, CLI binaries, an MCP stdio server, and picker HTML within `apps/nemlig-assistant/`.
- Reuses the monorepo's existing TypeScript, Node test runner, lint, build, and pnpm/Turbo conventions where possible; adds only the runtime packages required for CLI and MCP protocol behavior.
- Calls Nemlig's unofficial web/search APIs, so request contracts remain isolated and tested with fixtures.
