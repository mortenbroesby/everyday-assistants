## Why

A successful backend release can still leave a shopper unable to open or edit a draft in the installed ChatGPT connector. We need to exercise the same synthetic shopping journey before delivery and locate failures by boundary.

## What Changes

- Run the authenticated draft journey locally and in CI with isolated state and an ephemeral signer.
- Deploy an on-demand, synthetic-only staging Worker and container with a stable private ChatGPT connection using development Auth0.
- Measure cold and warm requests with bounded, content-free evidence.

## Capabilities

### New Capabilities

- `nemlig-staging-journey` covers synthetic local and hosted acceptance.

## Impact

A dedicated staging entrypoint uses the existing Worker, MCP and Durable Object implementations. Staging consumes separate provider resources and CI runner time.
