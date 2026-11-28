## Context

PR #390 connects a native conversation to a browser widget. PR #394 adds boundary tests and local infrastructure timing. Issue #393 tracks the combined manual harness.

## Goals / Non-Goals

An agent can run deterministic checks per boundary and choose a deeper model, local infrastructure or read-only provider check when relevant. The default journey stays local. Hosted staging and new CI or release jobs are outside this change.

## Decisions

Drive the built card with a real show-tool response and verify the edit through the original MCP draft. Keep the native model opt-in. For local infrastructure, use an ephemeral signer, an isolated Durable Object namespace and the same Dockerfile with an explicit synthetic backend build. A scoped fixture transport supplies the upstream catalogue responses to the real client.

## Risks / Trade-offs

Temporary drafts can be reopened while their container process is alive. A model run consumes two turns on the signed-in account, and host-specific rendering remains an observation in the native app. Docker engine or image-build failure should be distinguishable from an MCP assertion failure.
