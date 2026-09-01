## 1. Establish the production-only boundary

- [x] 1.1 Record the exact live tunnel-only scripts, commands, documents, instructions, tests, and references, plus the shared HTTP/Auth0/stdio/CLI files that production or local development still uses; verify the inventory with Astrograph and `rg` excluding archived OpenSpec history.
- [x] 1.2 Reconcile the older active hosted-service change with the completed Cloudflare production cutover so no pending task still directs implementation toward a tunnel milestone or dual-run fallback; verify both active changes validate strictly.
- [x] 1.3 Sync this change's hosted production requirements into the canonical `nemlig-chatgpt-integration` and `nemlig-mcp` specs without removing basket approval or secret-safety requirements; verify strict OpenSpec validation passes.

## 2. Retire the repository tunnel implementation

- [x] 2.1 Delete `scripts/nemlig-tunnel.zsh` and every root `nemlig:tunnel:*` package command while preserving local CLI, stdio MCP, shared HTTP backend, Cloudflare, and production acceptance commands; verify no live package command references a removed file.
- [x] 2.2 Delete `apps/nemlig-assistant/SECURE_MCP_TUNNEL.md` and update root/app `AGENTS.md`, the basket skill, security/contribution guidance, and live documentation to name only the hosted ChatGPT deployment; verify `rg` finds no supported tunnel setup outside archived history and explicit historical notes.
- [x] 2.3 Update `README.md` feature sets and `docs/cloudflare-operations.md` with the single production app, local development interfaces, and an optional manual checklist for stopping/removing already installed user-local tunnel services without executing it; verify commands and links resolve.
- [x] 2.4 Update privacy/public-tree checks for the removed paths and add a regression assertion that tunnel scripts and package commands do not return; verify the focused privacy test passes.

## 3. Cover the complete offered feature surface

- [x] 3.1 Add a closed expected inventory for every production MCP tool and resource, classifying default read-only calls, prepare-only calls, separately approved external-state calls, and prohibited capabilities; verify unit tests fail for both a missing expected entry and an unknown advertised entry.
- [x] 3.2 Extend default authenticated production acceptance to exercise bounded product search, favorites, guided planning, department listing/browsing, basket view, picker/resource metadata, and all add/remove/replace/clear preparation paths without applying a mutation; verify fake-client tests assert the exact call sequence and zero apply calls.
- [x] 3.3 Cover plan snapshot save/load and feature-request creation through deterministic contract tests, and add separate exact-approval live modes if production execution is still useful; verify the default live command cannot create a snapshot or GitHub issue.
- [x] 3.4 Replace the addition-only live mutation helper with a generic exact approval envelope that covers add, remove, replace, and clear paths and validates proposal contents before apply; verify changed proposals, expired/refused proposals, and indeterminate results never trigger a retry or sibling mutation.
- [x] 3.5 Implement exact initial-basket fingerprinting and minimal inverse restoration for an explicitly approved reversible mutation exercise; verify tests cover successful restoration, unavailable inverse products, price/state drift, and stop-with-evidence behavior.

## 4. Run production verification safely

- [x] 4.1 Run focused package tests and the safe default production probe against the installed Cloudflare/Auth0 service, recording which live features passed and which require a separate stateful approval; verify no basket, GitHub issue, or stored plan is changed by this step.
- [x] 4.2 Document the exact-envelope procedure for an optional live reversible mutation exercise and record that it was deliberately not run without a current token plus separate approvals for both mutation and restoration; retain the earlier independently approved add/remove readback evidence.
- [x] 4.3 Verify the installed ChatGPT app name, hosted action discovery, and existing authenticated favorites evidence; record that the broader token-backed conversational sweep was deliberately not rerun and remains available through the safe production feature command.

## 5. Evidence-led code cleanup

- [x] 5.1 Review the changed production path and feature-test code for dead compatibility branches, duplicated helpers, stale fixtures, misleading names, and over-engineering; delete only evidence-backed debt and verify focused tests still pass after each cleanup slice.
- [x] 5.2 Audit timeouts, retry bounds, authentication order, gateway quotas, proposal TTL/state binding, error sanitization, and secret/log surfaces after cleanup; verify no safety or cost guard was weakened and privacy scans contain no credential or private basket data.
- [x] 5.3 Run `pnpm verify`, `pnpm exec openspec validate --all --strict --no-interactive`, Cloudflare dry-run configuration validation, package smoke/production contract tests, and the tunnel-reference regression check; resolve every failure without skipping gates.
- [x] 5.4 Commit the completed scoped change to `main`, push it, verify `origin/main` equals the exact local SHA, and verify exact-head CI before handoff; keep any unrelated work untouched.
- [x] 5.5 Sync the delivered requirements and archive this change after all authorized tests pass, preserving the documented optional live-test boundaries instead of claiming unrun stateful operations.
