## Context

See [proposal.md](proposal.md). `workflow_run` and GitHub concurrency already
admit and serialize trusted `main` candidates. A durable lease is necessary
only because Worker and Container changes are not one atomic provider
operation. The recent incident showed a separate flaw: a later candidate
observed a safely reconcilable predecessor lease and ended instead of advancing
the queue.

## Goals / Non-Goals

**Goals:**

- Let the existing release workflow make forward progress after a proven
  terminal predecessor without another manual dispatch.
- Make terminal finalization depend on durable acceptance and exact deployment
  identity, not transient post-acceptance instance lifecycle output.
- Preserve strict fail-closed handling of uncertain provider mutations.

**Non-Goals:**

- No Cloudflare callback Worker, Queue, webhook receiver, cron reconciler, or
  extra workflow.
- No automatic retry of an uncertain rollout POST, forced restart, or automatic
  rollback.
- No change to provider, Auth0, Nemlig basket, or ChatGPT behavior.

## Decisions

### Reconcile in the waiting workflow, not through an event callback

The queued GitHub Actions run is the durable event consumer and already has the
candidate, CI provenance, protected environment, and native concurrency. It
will invoke a read-only predecessor-reconciliation mode when preflight sees a
lease. On success it repeats candidate checks and acquires a new lease. This
avoids building a second scheduler and preserves exact-SHA evidence.

Cloudflare Workers Builds event subscriptions and generic notification
webhooks do not attest that this GitHub/Wrangler Worker-plus-Container release
has reached the expected image, application version, edge revision and
authenticated MCP fixture. Container rollout API responses provide state, not
an authenticated completion callback. Bounded readback remains required.

### Release only terminal, owned, identity-matching leases

The successor can use the existing recovery predicate only with the saved
artifact, stopped original runner, known terminal journal, and exact Worker,
configuration, image and application-version readback. It must read back lease
deletion before a fresh candidate preflight/acquisition. Unknown outcomes stay
blocked. This is deliberately less aggressive than "release on workflow
failure": an Action failure may follow a provider mutation with no response.

### Normalize accepted terminal verification

After durable edge and authenticated service acceptance prove the expected
identity, finalization must not require another Container instance-lifecycle
sample. Lifecycle reads remain part of pre-acceptance proof and uncertain
recovery. This generalizes the verified restored-release correction without
weakening identity checks.

## Risks / Trade-offs

- [A successor misclassifies an uncertain predecessor as terminal] → Reuse the
  strict recovery predicate; add negative tests for missing artifacts, altered
  journal heads, drift and pending acceptance.
- [A race occurs between deletion and successor acquisition] → Re-run exact
  candidate preflight and use the existing atomic lease acquisition; report
  loss of the race without provider mutation.
- [Cloudflare edge propagation is delayed] → Keep the existing bounded
  acceptance retry budget. Do not infer acceptance from a Container event.

## Migration Plan

1. Add failing workflow/script tests for safe terminal predecessor continuation
   and unsafe predecessor retention.
2. Implement the narrow reconciliation branch and terminal predicate
   normalization.
3. Run focused tests, readiness and repository gates; merge normally.
4. Prove one subsequent green `main` release reaches the public exact revision
   and releases its routine lease. A rollback remains an explicit Codex-led
   incident action.
