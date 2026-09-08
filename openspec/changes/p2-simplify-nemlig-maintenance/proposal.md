## Why

The previous P2 maintenance change is complete at `7245d096`; repeating it would not address the remaining architectural and verification debt. A second audit at `c491823` found server-to-CLI coupling, permissive plan/list contracts, mixed planning/persistence responsibilities, import-time acceptance execution, unenforced release-version policy, and missing coverage wiring, alongside custom parsing that maintained dependencies can replace.

Epic: **Make the Nemlig assistant easier to change without weakening grocery safety.** This expanded plan contains ten ordered P2 stories with independently verifiable slices, plus separately prioritized follow-up work. It is a maintenance programme, not permission for a rewrite or for absorbing unfinished P0 authentication work.

## What Changes

- P2: replace release-agent argument parsing with the already installed `commander`, preserving valid invocations and explicitly testing malformed inputs and `--no-release` semantics.
- P2: evaluate and adopt `html-to-text` for bounded product descriptions and attribute text, replacing the HTML-stripping regex after fixture and package-cost checks.
- P2: make the existing coverage command produce a real report and establish a measured baseline using the existing Node test runner.
- P2: replace shopping-list `z.any()` output contracts with explicit public schemas using installed Zod, without exposing stored owner metadata.
- P2: reconcile stale backlog completion claims against implementation and acceptance evidence. Preserve outstanding human and production acceptance tasks.
- P2: remove the MCP/HTTP dependency on the executable CLI module; retain minimal shared client contracts and explicit transport composition.
- P2: characterize and separate pure planning calculations from snapshot I/O only where this removes real dependency coupling; retain current matching, ordering and concurrency.
- P2: extend concrete public schemas to plan lines/summary and characterize proposal result variants without changing valid wire payloads.
- P2: separate embedded picker presentation from tool orchestration where packaging/browser tests prove the boundary; no UI framework or generated tool registry.
- P2: make production-acceptance dispatch import-safe and enforce existing package-version policy in CI with explicit base/head inputs.
- P2: enable native unused-code checks after resolving the observed finding; document public/safety contracts and record code, dependency, package and verification deltas.
- Record P0 lifecycle/spec mismatches and P1 reliability investigations under their existing owners, and P3/P4 improvements as separate follow-up epics. These are not hidden implementation tasks in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-mcp`: add bounded plain-text product evidence and explicit shopping-list and plan response contract requirements. Internal reorganization preserves existing behavior; it does not create new capabilities.

## Impact

Primary scope: `apps/nemlig-assistant`, its release tooling, tests, package scripts, and backlog. The repository currently has one assistant package; this is not a monorepo framework migration.

Expected implementation areas: client normalization; CLI/MCP/HTTP composition; planning and snapshot adapters; MCP presentation and contracts; focused tests; release and acceptance entry points; app/root verification configuration; CI and documentation. Inspect callers before each slice. `html-to-text` is the only proposed new runtime dependency; Commander and Zod already exist. `tough-cookie` is evaluated for a separate authentication follow-up, not approved for installation here. No dependency is installed by this planning change.

### Goal and acceptance

Deliver simpler maintained boundaries and truthful verification: server entry points no longer depend on CLI composition; pure planning tests need no filesystem/network; valid release commands retain their meaning; descriptions decode entities within existing ceilings; list/plan responses have executable contracts; acceptance imports perform no network calls; coverage and release policy gates produce real evidence. Each slice records focused tests, request-count invariants, code/dependency delta and full verification before integration. Safe no-op findings are documented rather than forcing file splits or dependency removals to meet a quota.

### Non-goals and cost

No Auth0 replacement, invitation redesign, stored-credential change, new provider requests, parallel basket writes, retry changes, higher capacity, relaxed quotas, cache policy change, public API removal, or generic framework. No plausible material operating-cost increase is expected, subject to the implementation measurements below. HTML parsing adds bounded local CPU and package footprint, so adoption requires measured startup/bundle/runtime evidence; no performance improvement is claimed in advance. CI reporting adds some local/CI work; measure it and avoid duplicate test runs where practical.

### Planning completion

Done for this request means evidence-backed proposal/design/spec/tasks, strict validation, and a committed plan integrated into remote main with CI evidence. Implementation checkboxes remain unchecked until a later apply request.
