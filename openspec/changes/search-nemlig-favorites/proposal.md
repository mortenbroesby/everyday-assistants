## Why

The assistant can list favorites but cannot narrow them by a Danish product phrase, so finding a familiar item such as `banan` still requires manual scanning. Add a favorites-only search step now and defer broader Nemlig search until this smaller workflow is proven.

## What Changes

- Accept a non-empty text query when searching authenticated Nemlig favorites from the CLI and MCP surface.
- Match the query case-insensitively with Danish locale rules, return only matching favorites up to the requested limit, and preserve the existing candidate metadata and deterministic recommendation tags.
- Return multiple plausible favorites for conversational review; do not silently choose or mutate the basket.
- Reuse the existing exact `prepare_cart_additions` and separately approved `apply_cart_additions` flow after a favorite is chosen.
- Keep plain favorites listing available when no query is supplied.

### Non-goals

- Translating or mapping English queries, or adding a language disclaimer.
- Falling back to the general Nemlig catalog when no favorite matches.
- Automatically selecting a product, changing favorites, or changing any basket without the existing exact proposal and approval.

### Acceptance criteria

- A Danish query such as `banan` returns matching authenticated favorites and excludes unrelated favorites.
- Matching handles Danish casing consistently, honors the result limit, and returns an empty structured result when nothing matches.
- Multiple matches remain visible for user choice and are compatible with the existing basket proposal workflow.
- Search remains read-only and requires no new dependency or credential handling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-shopper`: Add authenticated Danish text search over favorites while preserving plain listing and basket safety.
- `nemlig-mcp`: Expose favorites text search as read-only ranked candidates for conversational selection.

## Impact

The change affects the Nemlig client/CLI, MCP favorites tool, and their focused tests under `apps/nemlig-assistant/`. It adds no dependency, remote search fallback, credential storage, or new mutation surface.
