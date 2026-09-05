## Why

The Worker already checks `MCP_ENABLED` before authentication or backend access, but exercising that control still depends on a long manual procedure and operator memory. We need a small, repeatable drill that proves the switch stops new work, preserves enough local evidence to recover after interruption, and restores only the exact deployment that was active before the drill.

## What Changes

- Add a repository-owned, owner-invoked kill-switch drill with explicit plan, execute, resume, and status behavior.
- Capture a privacy-safe local drill record containing the starting deployment/version, repository revision, observed endpoint state, Container state, completed phase, and restoration target; keep the record ignored and free of tokens, credentials, request bodies, shopping data, and raw provider output.
- Refuse execution when the checkout, exact revision, active deployment, route shape, one-Container ceiling, or fixed application identity does not match the expected safe baseline.
- During an explicitly authorized live drill, disable production first, prove both public routes reject with the documented 503 response and correlation IDs, and prove the fixed Container has no running instance before restoring anything.
- Restore the exact recorded starting version at 100% traffic, then verify deployment identity, health, revision, OAuth metadata, anonymous rejection, and Container inactivity. If restoration fails while the drill still controls the active disabled version, leave it disabled; if concurrent deployment drift appears, stop and report the exact observed state without overwriting someone else's deployment.
- Add deterministic tests for command construction, sanitized records, drift/concurrency refusal, interrupted-run recovery, no-wake evidence, exact restoration, and fail-closed terminal states.
- Update the production runbook and backlog with the new drill and its separate live-authorization boundary.
- Add no scheduler, queue, log drain, paid service, autoscaling, retry loop, or basket operation. Routine operating cost stays unchanged; a live drill incurs only bounded Cloudflare control-plane calls and a small fixed number of edge probes.

### Goal

Make the existing manual Worker-edge kill switch easy to exercise and recover without adding a second control plane or weakening current cost and safety limits.

### Non-goals

- Automating ordinary production deployment or replacing the deployment-automation backlog item.
- Automatically reacting to billing alerts, resetting the circuit breaker, changing Auth0, rotating secrets, or modifying DNS.
- Running on a schedule or creating a continuously available management service.
- Mutating a Nemlig basket, saved list, proposal, favorite, or other user data.

### Acceptance criteria

- The default command is read-only and prints the exact intended actions and restoration target.
- Live execution requires an explicit owner confirmation bound to the observed starting deployment and revision.
- Disabled evidence covers both routes, the exact 503 body, correlation IDs, and zero running instances for the fixed Container application.
- Restoration targets only the recorded starting version, refuses concurrent deployment drift, and proves the healthy restored state.
- An interrupted invocation can resume from its sanitized local record; uncertainty never produces an automatic enable or an unverified success claim.
- Repository tests and production-readiness validation pass without provider mutation, new recurring work, or increased capacity.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-cloudflare-hosting`: Strengthen the manual kill-switch requirement with a bounded, recoverable drill and exact restoration evidence.

## Impact

Expected changes are limited to a small TypeScript operations script and tests under `apps/nemlig-assistant`, package scripts, ignored local evidence handling, the Cloudflare operations/readiness documentation, the Nemlig backlog, and the existing `nemlig-cloudflare-hosting` specification. The drill uses the repository-pinned Wrangler CLI and existing endpoints; it adds no dependency or hosted component. Production execution remains a separate explicit owner action.
