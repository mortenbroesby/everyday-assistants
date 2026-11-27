## Why

Nemlig serves current categories through its v3 catalog. The owner also wants the assistant to remove a whole line or empty the real shopping basket after reviewing the consequences.

## What Changes

Resolve legacy quick suggestions to the storefront category URL and verify the returned category. Introduce separate review and confirmation for basket deletion in CLI and MCP.

## Capabilities

### Modified Capabilities

- `nemlig-mcp` gains reviewed basket deletions.
- `nemlig-basket-proposals` preserves the additive submit contract and routes deletions through separate reviewed operations.

## Impact

Provider client, CLI, MCP inventory, shopping guidance and focused tests. Delivery contract is GitHub issue #384.
