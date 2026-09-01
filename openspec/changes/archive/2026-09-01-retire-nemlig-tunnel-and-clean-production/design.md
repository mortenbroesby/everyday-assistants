## Context

See `proposal.md` for motivation. Production currently runs through a Cloudflare Worker gateway, one deterministic Container, Auth0 owner validation, quotas, and the existing HTTP MCP backend. The same HTTP backend was previously started by a Mac launchd/tunnel wrapper, so transport code must be classified by actual production use before deletion. Local CLI and stdio MCP remain supported development interfaces.

The current production acceptance code probes the edge and can verify one exact approved addition, but it does not inventory the whole MCP surface or restore the original basket. Repository instructions and canonical specs still name the tunnel as supported.

## Goals / Non-Goals

**Goals:**

- Remove only tunnel-specific entry points and guidance; retain shared HTTP/Auth0 code used by the production Container.
- Make feature coverage explicit and fail when production surface drifts.
- Separate non-mutating production verification from opt-in external-state tests.
- Make every basket write exact, approval-gated, read-back verified, and reversible to the original fingerprint.
- Use the cleanup pass to delete dead compatibility code and duplication found by tests, not to redesign working boundaries.

**Non-Goals:**

- Deleting external OpenAI tunnel objects, runtime keys, Auth0 resources, Cloudflare resources, DNS, or local untracked credentials.
- Removing the local CLI, stdio MCP, shared Streamable HTTP backend, or their tests.
- Calling checkout, payment, ordering, or delivery-slot operations.
- Adding a new test framework, browser harness, provider abstraction, or observability service.

## Decisions

### 1. Delete the tunnel adapter, retain shared transports

Delete the root tunnel package scripts, `scripts/nemlig-tunnel.zsh`, `SECURE_MCP_TUNNEL.md`, and instructions that direct operators to them. Retain `src/http.ts` because the production Container starts `dist/http.js`; retain `src/mcp.ts`, CLI, and stdio entry points because they are shared core/development interfaces.

Alternative: remove all local networking and stdio code. Rejected because it would delete the production backend and useful local development interfaces, not merely the tunnel.

### 2. Treat production tool/resource inventory as a closed contract

The acceptance client will enumerate tools and resources, compare them with a committed classification, and fail on missing or unknown entries. Each entry is classified as safe to invoke by default, prepare-only, external-state opt-in, or prohibited. Metadata-only checks cover `create_feature_request` by default so tests never file a real issue accidentally.

Alternative: hard-code a few representative calls. Rejected because it allowed several shipped features to remain untested and would not detect new unclassified tools.

### 3. Split acceptance into safe default and explicit stateful modes

The default authenticated production run performs edge checks, inventory, read-only calls using bounded queries, and proposal preparation without apply. Snapshot creation, feature-request submission, and basket mutation require separate explicit flags plus exact approval envelopes. Unit/contract tests exercise all stateful branches with fakes even when live stateful modes are not authorized.

Alternative: make the default suite mutate and clean up automatically. Rejected because cleanup cannot make an indeterminate external mutation safe and repository verification must not imply permission to change external data.

### 4. Restore baskets by exact diff, never by broad clear/replace shortcuts

Capture the complete initial normalized basket and fingerprint. After an approved test mutation, compare fresh state with the expected state, then prepare the minimal inverse proposal operations needed to restore the initial basket. Every inverse operation gets its own exact precomputed approval envelope, apply, and fresh readback. If an apply is indeterminate or any fingerprint differs, stop without retrying and print sanitized recovery evidence.

Alternative: clear the basket and rebuild it. Rejected because it is unnecessarily destructive, can lose unavailable products, and broadens the approved mutation.

### 5. Cleanup follows evidence from the new coverage

After tunnel deletion and feature tests, run reference searches, focused tests, root verification, strict OpenSpec validation, privacy/secret scans, and a small over-engineering review. Delete only code proven unused or duplicated. Keep authentication, gateway limits, retry/time bounds, proposal persistence semantics, and sanitization even when they add code.

Alternative: broad refactor before testing. Rejected because it obscures whether failures come from tunnel retirement, coverage work, or cleanup.

## Risks / Trade-offs

- [Archived OpenSpec history will still mention the tunnel] → Exclude archives from supported-path checks and keep them immutable as historical evidence.
- [The active older hosting change still contains pre-cutover tunnel milestones] → This follow-up change becomes the authoritative cutover record; archive/sync it before closing the older plan or reconcile the older task statuses during implementation.
- [A live read-only call may still consume quota or contact Nemlig] → Use bounded inputs, respect gateway quotas, and classify calls so the suite stops on rate limits rather than retrying broadly.
- [Exact restoration may be impossible if upstream availability or price changes mid-test] → Stop on mismatch, preserve the last verified basket evidence, and require human review; availability is less important than avoiding uncontrolled writes.
- [Removing repository scripts does not stop an already installed local launchd service] → Document the one-time optional manual retirement command separately; do not delete user-local files or services during repository implementation without explicit confirmation.
- [Production credentials and access tokens are needed for authenticated live tests] → Read them only from existing secure environment/session mechanisms, never echo them, and keep deterministic unit/contract coverage runnable without secrets.

## Migration Plan

1. Record the exact tunnel-only file/reference inventory and the production files that must remain.
2. Delete tunnel scripts/commands/docs and update live instructions, canonical specs, README feature inventory, and operations docs.
3. Add closed production surface classification and comprehensive fake-client tests.
4. Run default live production acceptance for edge, authentication, discovery, and authorized read-only/preparation operations.
5. Run separately approved stateful tests, including reversible basket coverage, only with exact approval envelopes.
6. Perform the evidence-led cleanup pass and all repository gates.
7. Commit and push the scoped change, verify the remote ref and exact-head CI, then sync/archive the OpenSpec change.

Rollback is a Git revert of the repository commit. Production remains available during repository cleanup because the hosted endpoint and installed ChatGPT app are unchanged. Recreating a tunnel fallback is not part of rollback; an outage uses the documented Cloudflare rollback/disable procedures.
