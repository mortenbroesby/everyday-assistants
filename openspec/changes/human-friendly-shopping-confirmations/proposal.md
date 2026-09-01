## Why

Basket proposals and confirmations currently read like protocol output instead
of a household shopping assistant. Normal ChatGPT replies should be concise and
friendly while the server continues to enforce the same exact proposal,
approval, expiry, revalidation, and readback guarantees internally.

## What Changes

- Present ordinary basket reviews and results as short shopping summaries such
  as `1 banana · 2.50 kr.` followed by one clear approval question or result.
- Keep proposal UUIDs, product IDs, expiry timestamps, protocol terminology,
  internal states, and redundant price calculations out of normal user-facing
  text.
- Include package size, unit-price detail, or technical identifiers only when
  they disambiguate a choice, support a replacement comparison, troubleshoot a
  failure, or the user explicitly asks for them.
- Retain all exact machine-readable fields needed to bind and apply an unchanged
  proposal safely; presentation simplification must not alter mutation gates.
- Update the README feature inventory and examples when the behavior ships.
- **Goal:** make approval and result messages immediately understandable to a
  non-technical family user without weakening basket safety.
- **Non-goals:** changing basket semantics, hiding material product or price
  differences, adding autonomous writes, changing hosting, or introducing a new
  rendering framework.
- **Acceptance criteria:** representative add, remove, replace, and clear flows
  produce concise ordinary text; ambiguous or materially different products
  still show enough detail for an informed choice; apply calls still require the
  exact opaque proposal internally; tests prove internal identifiers remain
  available to the protocol but absent from normal presentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: Separate concise human-facing basket summaries from the exact
  machine-readable proposal and readback data used by MCP clients.
- `nemlig-chatgpt-integration`: Require normal ChatGPT replies to use friendly
  shopping language and suppress protocol details unless they are useful or
  explicitly requested.

## Impact

- Affects Nemlig MCP server instructions and basket tool result presentation,
  focused MCP/ChatGPT contract tests, and user-facing README examples.
- Preserves existing tool names, input/output schemas, proposal persistence,
  authentication, mutation approval, rate limits, circuit breaker, and hosted
  deployment behavior.
- Adds no dependency, external service, storage, request amplification, or
  plausible material operating-cost increase.
