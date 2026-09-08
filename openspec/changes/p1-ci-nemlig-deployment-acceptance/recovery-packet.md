# S2 recovery implementation handoff

Sol resolved U4 on 2026-09-09 using the installed CLI and GitHub's
[refs API](https://docs.github.com/en/rest/git/refs),
[Git database API](https://docs.github.com/en/rest/git), and
[`gh api` input contract](https://cli.github.com/manual/gh_api).
Root reviewed this packet. It changes repository tooling only; no real remote
lease, provider call, credential or deployment is authorized by this packet.

## Ownership and scope

Terra owns `apps/nemlig-assistant/scripts/production-deploy.ts` and
`apps/nemlig-assistant/src/production-deploy.test.ts`, sequentially after its
compatibility handoff. Root supplies the exact current isolated-worktree base
at dispatch. No new dependency, provider abstraction, storage service or runtime
change. Root owns integration and operational documentation; Luna reviews
the resulting fake command traces independently.

## Ordered implementation

- [ ] First characterize same-source competing releases and failed intent writes.
  Use `randomUUID()` for operation ownership, distinct from source SHA; inject
  a deterministic ID only through the existing dependency seam for tests.
- [ ] Introduce strictly validated schema-2 public-safe journal snapshots:
  operation UUID, source SHA, decimal CI run ID/attempt (or fixed local labels),
  timestamps, enumerated outcome/state, and contiguous intent/result records.
  Cap the serialized UTF-8 snapshot at 8 KiB and transitions at 32. Permit only
  fixed phases/checks/failure categories, version UUIDs and image digests; reject
  unknown fields. Never include raw command output, host paths, actors, env,
  tokens, subjects, account data or arbitrary error strings.
- [ ] Store a single `journal.json` blob/tree in a unique root Git commit and
  acquire the existing fixed production ref atomically. An existing ref,
  including a legacy source-SHA lease, blocks acquisition. Do not delete it.
  Subsequent snapshots must be direct children of the last exact journal
  commit, updated with `force:false`, followed by exact ref readback. Never
  append from a refreshed competing parent. Local atomic JSON is a mirror,
  not the recovery authority.
- [ ] Persist the starting Worker/image snapshot and durable intent before each
  disabled deploy, enable and rollback. Recheck candidate ownership immediately
  before each provider command. Append verified results after readback.
  Remote or local-mirror persistence failure before dispatch prevents dispatch;
  failure after dispatch retains the lease and records uncertainty if possible.
- [ ] Extend the existing runner with stdin input and AbortSignal. Use
  `gh api --input -` for nested JSON, never shell interpolation or secret files.
  A bounded spawn runner terminates the child process group on Linux/macOS,
  waits five seconds then escalates to SIGKILL and waits for closure. Reject
  output overflow. Timeout/abort after intent is uncertain, never a reason to
  repeat or automatically roll back the command. Main handles SIGINT/SIGTERM.
- [ ] Stop deleting leases in deploy's `finally`. Persist terminal evidence and
  keep ownership. Add explicit `finalize <operation-id>` after the caller has
  saved final evidence (CI invokes it only after successful artifact upload).
  It rereads and validates exact ownership, known terminal result, no pending
  intent and current provider state before deleting the ref; remove local lock
  only after successful deletion. A missing/failed artifact step does not run it.
- [ ] Add read-only `inspect-recovery <operation-id>` with optional explicit
  original-runner-stopped attestation. Read the bounded remote snapshot and at
  most three provider state records. Report fixed reasons and whether current
  version/image match; never deploy, roll back, append or delete. Attestation
  alone must not turn a pending/unknown transition into cleanup permission.
  Reconciled late success is evidence, not authorization to retry or unlock.

## Required fake-runner evidence

Two hosts/same source/different UUID; existing other operation and legacy ref;
competing child between GET/PATCH; changed owner before finalize; unknown fields,
malformed/base64/oversized snapshots and 33rd transition; each remote-intent API
failure preventing provider dispatch; lost local mirror with recoverable remote
intent; cancellation and timeout after accepted upload; remote-result persistence
failure; omitted finalize after simulated artifact failure; successful finalize
only after exact known terminal state; wrong operation, absent stopped-runner
attestation, pending intent and provider/image drift deny recovery cleanup;
direct-parent journal chain and intent/result ordering around each mutation.

Run focused deploy tests, typecheck, lint, strict spec validation and diff check.
Report exact commit and which S2 tasks are fully satisfied. U1 effective config
and exact Container rollback semantics remain separate, and no fake test may be
reported as live proof. Root runs the composed full repository/readiness gates.

## Constraints and cost

GitHub DELETE has no expected-SHA parameter. Read-then-delete is not CAS;
legitimate clients must never steal, replace, TTL-expire or append to a finalized
operation. Drift or ambiguity retains ownership. Document the out-of-protocol
race rather than claiming absolute fencing. `contents:write` is repository-wide,
not scoped to one ref; S5 protections remain required before credentials exist.

At most 32 snapshots add roughly 164 bounded GitHub API calls plus finalization;
normal releases use substantially fewer. There is no additional Container,
provider request amplification, paid service or runtime capacity change.
