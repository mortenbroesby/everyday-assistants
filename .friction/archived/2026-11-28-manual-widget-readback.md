# Manual widget smoke stalled during draft refresh
- Date: 2026-11-28
- Scope: Nemlig manual agent harness
- Task: #393
- Revision: PR #390 at 4c966b2 integrated with PR #394
- Paths: apps/nemlig-assistant/scripts/conversation-widget.mjs
- Category: validation
- Severity: medium
- Status: resolved

## Observation and evidence
The scripted Chrome check timed out waiting for the edit control. On inspection the fixture item and initial quantity had already rendered. The card was waiting for a refresh. In the separate loopback MCP check, the client reported a connection reset while sending a request.

## Impact
A generic selector timeout obscured which segment failed. The native two-turn conversation and its widget edit had passed in the same checkout.

## Hypothesis
A failed refresh can leave the host simulator waiting for an RPC reply. The original timeout alone does not establish why the loopback connection closed.

## Improvement and validation
Report the asset, host initialization, refresh and edit boundaries separately. Verify the original draft quantity through MCP after exactly one edit.

## Resolution
The host now returns a bounded JSON-RPC error when a fixture request rejects. It observes mount, initialization, the rendered row and edit readiness independently, and opens separate connections for stateless fixture requests. The scripted Chrome check passed with two units on the same draft.
