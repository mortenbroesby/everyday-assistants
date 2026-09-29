## Why

ChatGPT currently receives Nemlig image URLs as product data but does not turn them into visible cards. In the latest shopping conversation it told the user that six basket products were displayed when no images appeared. The actual provider basket has no dedicated visual read, so the claim cannot be verified by the user.

## What Changes

- Add an explicit, read-only visual view of the actual Nemlig basket, using the existing shared product viewer and a complete text fallback.
- Keep ordinary basket inspection cheap. Bound extra exact-product reads for the visual action; show missing images and partial detail failures honestly while retaining all basket lines.
- Label the provider basket distinctly from the local review and show basket quantities in the visual rows.
- Guide ChatGPT to use the visual action when asked to show the actual basket, without asserting that the host rendered a card merely because an image URL was returned.

No basket change, checkout, payment, order, credential, provider, or deployment behavior is added.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Add a bounded visual provider-basket read and viewer fallback contract.
- `nemlig-chatgpt-integration`: Make visual basket requests and host-rendering claims honest.

## Impact

Issue [#139](https://github.com/mortenbroesby/everyday-assistants/issues/139). One branch (`codex/nemlig-visual-basket`), one PR, one Nemlig release boundary. Affects the MCP tool catalog, gateway allowlists, the existing viewer, acceptance tests, and app documentation. No new dependency or production mutation; deployment requires separate approval.
