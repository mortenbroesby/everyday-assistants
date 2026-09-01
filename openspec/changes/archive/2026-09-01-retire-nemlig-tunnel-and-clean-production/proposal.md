## Why

The Cloudflare/Auth0 Nemlig Assistant is now the accepted production path, but the repository still presents and carries the retired Secure MCP Tunnel implementation. Keeping both paths creates duplicate commands, stale operational guidance, misleading specifications, and test ambiguity at the point where the family should have one dependable setup.

## What Changes

- **BREAKING** Remove the Secure MCP Tunnel scripts, package commands, setup guide, launchd workflow, and tunnel-specific repository guidance.
- Make the single Cloudflare/Auth0 production app the only supported ChatGPT deployment while retaining the local CLI and stdio MCP for development and direct local use.
- Update the canonical specs and documentation so they describe the hosted owner-authenticated boundary rather than the retired tunnel boundary.
- Expand automated production acceptance coverage across every offered MCP feature, including tool/resource discovery, read-only shopping flows, proposal preparation, and explicitly approved reversible basket mutations.
- Keep production mutation tests opt-in, exact, approval-gated, read back after every apply, and restore the original basket state or stop with explicit recovery evidence.
- Remove stale compatibility branches, duplicated helpers, fixtures, and documentation discovered during the feature-verification pass without weakening authentication, quotas, timeouts, proposal safety, or secret handling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-chatgpt-integration`: Replace the tunnel-only deployment and local credential boundary with the single hosted Cloudflare/Auth0 production integration, while retaining local development interfaces and private single-household scope.
- `nemlig-mcp`: Require production acceptance coverage for the complete advertised MCP tool/resource surface and safe opt-in verification of reversible proposal-based basket writes.

## Impact

- Deletes `scripts/nemlig-tunnel.zsh`, `apps/nemlig-assistant/SECURE_MCP_TUNNEL.md`, and the root `nemlig:tunnel:*` commands.
- Updates repository and app instructions, READMEs, Cloudflare operations documentation, main OpenSpec capabilities, and privacy checks that mention tunnel artifacts.
- Extends `apps/nemlig-assistant/src/production-acceptance.ts`, its wrapper and tests, plus focused interface tests where feature gaps are found.
- Does not delete external tunnel resources, revoke keys, mutate Auth0/Cloudflare configuration, change DNS, or touch the Nemlig basket during ordinary verification.
- Acceptance requires zero supported tunnel entry points or setup instructions, complete production feature coverage, passing focused and root verification, a clean secret scan, and remote-ref proof for the final commit.

## Non-goals

- Public distribution, multi-household account mapping, checkout, payment, order placement, or delivery-slot changes.
- Replacing the local CLI or stdio MCP development interfaces.
- Re-architecting the working Cloudflare container/gateway solely for aesthetic cleanup.
- Deleting external OpenAI tunnel objects or local untracked credentials without a separate explicit operator action.
