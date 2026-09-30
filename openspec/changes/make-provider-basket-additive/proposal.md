## Why

Nemlig's observed `AddToBasket` endpoint sets one product's absolute quantity, but the assistant currently treats an approved quantity as the final total. Re-adding an item already in the basket can therefore reduce its quantity, while separate assistant removal, replacement, and clear tools can remove existing basket contents. The household policy is add-only.

## What Changes

- **BREAKING** Change assistant basket additions to positive quantity deltas that are resolved against the latest verified basket, with stale-state checks and exact readback.
- **BREAKING** Remove provider-basket removal, replacement, and clear operations from MCP and CLI, including their provider client paths.
- Avoid a redundant `/login` before a protected write when the authorized client already has an authenticated session; still authenticate when required.
- Bootstrap Nemlig's anti-forgery cookies before login and send the matching XSRF header and same-origin `Origin` on state-changing API calls, matching the website's first-party request flow.
- Keep the existing login flag values until a successful provider-backed test establishes their behavior. Corrected requests still returned HTTP 400; the browser readback showed the existing basket lines unchanged, so the flags' effect remains unknown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-basket-proposals`: approved additions are increments; provider basket removal, replacement, and clearing are not assistant capabilities.
- `nemlig-mcp`: expose only protected additive basket writes and reuse an authenticated client session when valid.

## Impact

One scoped change for issue #165, one PR, starting from current `origin/main` at `63cc0eecd570490ed55a1f91078f331d2c2e17e4`. Expected code changes are limited to Nemlig client, proposal service, MCP/CLI tool registration, tests, API inventory, README and the two affected specs. No checkout/order/delivery path is introduced. Live login-flag semantics and concurrent edits through another Nemlig client remain evidence gaps; neither will be represented as proven by local tests.
