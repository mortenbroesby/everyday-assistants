## Why

Nemlig's observed `AddToBasket` endpoint sets one product's absolute quantity, but the assistant currently treats an approved quantity as the final total. Re-adding an item already in the basket can therefore reduce its quantity, while separate assistant removal, replacement, and clear tools can remove existing basket contents. The household policy is add-only.

## What Changes

- **BREAKING** Change assistant basket additions to positive quantity deltas that are resolved against the latest verified basket, with stale-state checks and exact readback.
- Bind every per-product provider write to the last verified basket snapshot; stop before the next write if the basket changes between additions.
- **BREAKING** Remove provider-basket removal, replacement, and clear operations from MCP and CLI, including their provider client paths.
- Avoid a redundant `/login` before a protected write when the authorized client already has an authenticated session; still authenticate when required.
- Bootstrap Nemlig's anti-forgery cookies before login and send the matching XSRF header and same-origin `Origin` on state-changing API calls, matching the website's first-party request flow.
- **SAFETY** Stop sending the assistant's unconditional `false,false,false` login flags. Current first-party Nemlig code maps that combination to the login-dialog choice named “remove from basket”; use the website's ordinary login defaults and fail closed if the provider requires a separate merge decision. The backend effect of those flags remains unverified.
- Keep live flag semantics explicitly unproven until one bounded successful request and immediate readback establish behavior; previous corrected requests returned HTTP 400 and the browser readback showed the known basket unchanged.
- Use the existing protected `AddToBasket` path for each distinct approved product, sequentially. Do not introduce a second submission path or use it as a fallback after failed authentication.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-basket-proposals`: approved additions are increments; provider basket removal, replacement, and clearing are not assistant capabilities.
- `nemlig-mcp`: expose only protected additive basket writes and reuse an authenticated client session when valid.

## Impact

One scoped change for issue #165, one PR, starting from current `origin/main` at `63cc0eecd570490ed55a1f91078f331d2c2e17e4`. Expected code changes are limited to Nemlig client, proposal service, MCP/CLI tool registration, tests, API inventory, README and the two affected specs. No checkout/order/delivery path is introduced. First-party website source identifies the normal-login and explicit remove-choice flag tuples, but does not establish server-side effects for this account. Live login outcome and concurrent edits through another Nemlig client remain evidence gaps; neither will be represented as proven by local tests.
