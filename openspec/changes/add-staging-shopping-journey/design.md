## Context

Production verifies a machine principal on a restricted MCP surface. The owner path and installed viewer need separate evidence.

## Goals / Non-Goals

Exercise the normal signed shopper request, review resource, temporary draft and quantity readback. Production provider data and basket changes are outside this journey.

## Decisions

Use dedicated Worker and container entrypoints, independent namespaces and an explicit fixture provider. Local execution uses an ephemeral signing key with public discovery material available only to the local test processes. Hosted staging uses a separate Auth0 issuer and a stable resource URL. Run on demand with one sleeping instance.

## Risks / Trade-offs

Retain process-local draft semantics. A native ChatGPT result requires an observed private connector session. Additional cost comes from Docker builds, Actions minutes, staging compute and retained images. Continuous polling could keep the instance awake.
