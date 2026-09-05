## Context

See `proposal.md` for motivation and `specs/nemlig-cloudflare-hosting/spec.md` for the behavioral contract. The gateway already compares `MCP_ENABLED` with the exact string `true` before configuration loading, authentication, Durable Object access, or Container access, and focused tests prove disabled requests stop there. Production releases have historically produced a disabled and enabled immutable Worker version for the same application revision, but selecting, exercising, and restoring those versions is manual.

Cloudflare separates immutable Worker versions from deployments: a deployment routes traffic to one or two versions, and rollback promotes one selected version to 100 percent traffic. The repository-pinned Wrangler exposes JSON for deployments, versions, version details, Container applications, and Container instances. A version includes code and configuration but not Durable Object data, so the drill must use a disabled/enabled pair with the same application revision and compatible bindings rather than building or uploading code during the exercise.

## Goals / Non-Goals

**Goals:**

- Make a full disable/prove/restore/prove exercise one bounded, resumable operator workflow.
- Reuse immutable versions already created by the disabled-first release process.
- Make every mutation conditional on freshly observed deployment identity.
- Preserve a small privacy-safe recovery record before the first mutation.
- Keep all normal and failure paths deterministic, testable, and fail-closed.

**Non-Goals:**

- Uploading or building a Worker version, automating ordinary releases, or creating a second emergency-control mechanism.
- Adding Cloudflare API code or handling Cloudflare tokens directly; the script delegates to the pinned Wrangler CLI and its existing authentication.
- Automatically resolving genuine concurrent deployment changes.
- Inspecting application payload logs or performing authenticated Nemlig feature calls.

## Decisions

### Use a single TypeScript drill command with explicit modes

Add `scripts/kill-switch-drill.ts` and a package command such as `production:kill-switch`. Its modes are `plan` (default), `execute`, `status`, and `resume`. Core parsing and state-transition logic lives in a separately testable source module; process execution, filesystem state, time, and fetch are injected at the edge.

The default `plan` mode performs live read-only inspection because a useful plan must name the active restoration target. `execute` requires a confirmation value printed by the immediately preceding plan and derived from the starting deployment ID, starting version ID, and application revision. `status` never mutates. `resume` may restore only when the active version equals the drill-recorded disabled version and the starting restoration target remains valid.

Alternative considered: separate disable and enable shell snippets. They are shorter but cannot safely bind restoration to the observed starting state or recover after interruption.

### Roll between an existing compatible version pair

The planner reads the current single-version deployment, its version details, and the public `/revision`. It searches the bounded recent-version list for exactly one disabled candidate whose `MCP_ENABLED` is not exactly `true`, application revision equals the active application revision, and safety-relevant bindings/settings match. An optional explicit disabled version ID may disambiguate candidates, but it is accepted only after the same validation.

Execution uses an explicit version-targeted Wrangler rollback with a drill message, which promotes the selected immutable version to 100 percent traffic. Restoration uses the same mechanism with the recorded starting version. The script never runs `wrangler deploy` or `wrangler versions upload`, so the exercise cannot accidentally build different code, replace variables, or roll out a new Container image.

Alternative considered: upload the current checkout with `MCP_ENABLED=false`. That makes emergency disable depend on a successful local build and may change unrelated code or bindings, so it is rejected for the drill.

Alternative considered: patch the Worker settings through the Cloudflare API. That duplicates Wrangler authentication and remote-schema handling and creates a second control plane, so it is rejected.

### Persist a small atomic recovery record locally

Before the first rollback, write an atomic JSON record under an ignored app-local runtime directory. The schema contains a version number, drill ID, timestamps, worker name, canonical and fallback origins, starting deployment/version, application revision, selected disabled version, Container application ID, phase, correlation references, and coarse verification results. It never stores authorization, environment values other than the boolean switch classification, arbitrary provider responses, or Nemlig data.

Only one unfinished record may exist. A new drill refuses to start until it is completed or explicitly inspected and resolved. Writes use temporary-file-plus-rename and restrictive file permissions. Successful completion retains a sanitized evidence record; rotation keeps a small fixed number and creates no remote storage.

Alternative considered: keep state only in terminal output. It is simpler but makes interruption recovery depend on scrollback and operator memory.

### Treat every deployment mutation as at-most-once until readback

Immediately before each rollback, re-read the active deployment and compare it with the expected phase. After invoking rollback once, always inspect deployment state before deciding whether it failed; never repeat a mutation merely because the command timed out or returned ambiguous output. Polling uses a short fixed deadline and interval, with no recursive or background retry.

If another version appears, the command stops without overwriting it. If restoration fails while the drill-selected disabled version is still active, the command leaves it disabled and prints the exact starting version for manual recovery. This favors availability loss over unbounded cost or overwriting concurrent operator action.

### Prove both edge rejection and Container inactivity

Disabled verification performs one bounded request against each configured public origin. Each must return status 503, the exact fixed body, and an `x-nemlig-request-id`. It then resolves the one expected Container application from Wrangler's JSON inventory and requires its instance list to contain no running state. Restoration verification reuses the existing production edge verifier for health, revision, OAuth metadata, anonymous rejection, and foreign-origin rejection, then repeats the zero-running-instance check.

The script records only fixed outcomes, latency, version/revision IDs, and correlation references. It does not tail logs; correlating request IDs to lifecycle logs remains a separate manual diagnostic if Container evidence is inconsistent.

### Keep cost and authority boundaries unchanged

There is no scheduled drill. Planning and status perform only bounded read-only Cloudflare control-plane calls and edge probes. A live exercise performs exactly two version-targeted deployment mutations in the success path, two disabled edge probes, one enabled edge acceptance sequence, and bounded Container inventory checks. It does not call Nemlig or authenticated MCP tools.

Repository implementation and tests do not authorize a live execution. The operations documentation will continue to require an explicit owner request for each production drill.

## Risks / Trade-offs

- [A matching disabled version may have aged out of Cloudflare's recent-version window] → Refuse the drill and direct the release workflow to produce a fresh disabled/enabled pair; never upload from the drill.
- [Wrangler JSON formats can change] → Validate parsed data through a strict allowlisted schema, pin Wrangler, keep representative fixtures, and fail before mutation on unknown shapes.
- [A rollback command can succeed after the local process reports failure] → Re-read the active deployment once the command returns ambiguously; mutations remain at-most-once until state is known.
- [A concurrent release can race the drill] → Compare active deployment identity immediately before every mutation and stop without overwriting any unrecognized version.
- [A Container may still be shutting down when edge disablement is already effective] → Poll its state for a short fixed deadline; do not restore or claim no-wake evidence until zero running instances is observed.
- [Retaining local evidence exposes operational identifiers] → Store no secrets or user data, use restrictive permissions, ignore the directory, and rotate a small fixed count.
- [The drill temporarily makes the assistant unavailable] → Require explicit live authorization, print the expected outage, and restore only after disabled evidence completes.

## Migration Plan

1. Add the pure state machine/parsers and deterministic fixtures/tests.
2. Add the thin Wrangler/fetch/filesystem command adapter, ignored record path, and package command.
3. Update readiness and operations documentation plus the existing backlog checklist.
4. Run focused tests, `pnpm verify`, strict OpenSpec validation, privacy checking, package smoke, and Cloudflare dry run. These steps make no provider mutation.
5. Commit and push the implementation branch and verify exact-head CI.
6. Only after separate explicit production authorization, run `plan`, review its exact version pair and cost/safety summary, execute the drill, and retain the sanitized result.

Rollback the repository change by reverting its commit; it does not change production by itself. During a live drill, recovery is the exact starting version stored before mutation. If the drill loses control because another deployment appears, stop and reconcile that deployment rather than forcing the recorded version.
