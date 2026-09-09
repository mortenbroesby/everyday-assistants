# S2.6 image and configuration proof

Sequential handoff after durable recovery integrates. Root coordinates; Terra
owns the existing deploy script and its test file, Luna reviews fake traces.
No new dependency, second Container, live release or provider setup. This packet
does not authorize a rollback experiment. Keep unknown live behavior explicit.

## Grounded adapter contract

Pinned Wrangler 4.127.1 and the read-only metadata recorded in `evidence.md`
provide these inputs through the existing command seam:

- `deployments list --json`: latest deployment must contain exactly one
  100-percent Worker version, identified by UUID.
- `versions view <version> --json`: inspect `resources.script_runtime` and
  `resources.bindings`; select known plain safety/configuration values and
  binding names/types. Never retain secret values or raw provider payloads.
- `containers list --json`: select exactly one application named
  `nemlig-mcp-cloudflare-production-nemligmcpcontainer-production`; require
  UUID ID, one instance slot, digest image and valid application version.
- `containers instances <app-id> --json`: disabled acceptance requires the
  expected inactive assignment, not an empty or unknown response. Enabled
  acceptance requires one running instance with its version equal to the
  observed application version. Application version is not Worker version.

Verify exact parser types against pinned CLI source before implementation.
Reject missing, malformed, ambiguous or unknown shapes. Provider readback
must remain bounded by the existing release deadline and request budget.

### Verified command-shape clarification

In pinned Wrangler 4.127.1, `instancesCommand` selects
`rowsToJsonOutput(rows)` for our unpaginated `containers instances ID --json`
command. This is a bare array. The `{ instances, result_info }` wrapper applies
only when `--per-page` or `--page-token` is supplied; do not change the parser
to that wrapper while leaving the command unpaginated.

`rowsToJsonOutput` represents an assigned Durable Object with no running
instance as `state: "inactive"`, its Durable Object ID/name, and `version: null`.
Do not require an instance UUID or a non-null application version for that
inactive assignment. Prove the fixed assignment name and one-row cardinality.
Running rows expose `app_version` as `version`; compare that to the application
version, not to a Worker UUID. The existing bare-array shape was correct; the
missing strictness concerns field types and identity/version correspondence.

The installed Wrangler package also exports `unstable_readConfig` (including
production environment normalization) and `experimental_readRawConfig`. Prefer
its existing JSONC/configuration machinery over a new parser dependency when
implementing the proposed-config preflight; keep raw diagnostics/configuration
out of persisted reports and verify that no redirected config changes the
trusted source contract.

### Next implementation contract: persisted compatibility proof

After the strict parser slice, extend the existing journal only with optional
starting/disabled/enabled application-version numbers and one starting effective
configuration SHA-256 digest. Keep the existing 8 KiB/32-transition bounds and
closed field validation. Initial preflight snapshots may omit these fields;
terminal image-aware recovery must require them rather than treating an older
incomplete snapshot as proof.

Build the configuration digest from deterministically sorted, validated
allowlisted safety/onboarding plain values, fixed Durable Object binding
names/classes and secret binding names/types only. Never hash or read secret
values. Keep `MCP_ENABLED` and source revision separate because the state machine
intentionally changes them. Compare candidate configuration to the starting
digest; retain plain values only in memory for validation/preservation, not in
the public journal. Preserve current onboarding enablement explicitly when a
repository default would overwrite it; unexplained safety/topology differences
must stop before dispatch rather than being accepted as a new default.

The image-aware recovery extension needs four bounded provider records:
current deployment, Worker version, Container application, and instance rows.
The earlier recovery-only three-read cap is insufficient for its new instance
proof. Update the inspection cap, tests and runbook together in S2.6/S2.7;
do not claim that the current three-read implementation already proves it.
This adds one read-only metadata request per inspection, no Container wake,
mutation, paid resource, polling loop or capacity change. The operation's
existing total deadline remains mandatory.

### Running-instance proof packet

Pinned `deriveInstanceState` emits `provisioning`, `running`, `failed`,
`stopping`, `stopped`, `unhealthy` or `unknown`; an uninstantiated Durable Object
assignment is separately `inactive`. Do not invent a `starting` CLI state.

After authenticated read-only acceptance, require one row for the fixed
`nemlig-production` assignment, a nonempty ID, state `running`, and the exact
candidate numeric application version. Allow only bounded convergence: at most
36 instance reads with the existing five-second abortable delay and shared
operation deadline. Failed/unhealthy/unknown or malformed responses fail closed;
provisioning or a previously running version can converge without a mutation
retry. Reuse the existing polling/cancellation seam, not a new scheduler.

After a matching row is observed, reread the current Worker and Container
application and verify exact candidate Worker UUID, application ID, image digest
and application version before recording success. This avoids three repeated
metadata reads on every poll: at most 36 instance reads plus two final metadata
reads, with no added Nemlig request or Container wake. Lease ownership must still
be checked before any failure-recovery mutation.

Persist the application versions before considering instance-aware recovery
complete. Recovery of enabled production may observe the fixed inactive
assignment or a matching running instance; it must never accept a different
running version. Disabled recovery requires the fixed inactive assignment.
Worker-only rollback with a different application/image remains unknown rather
than a restoration claim. Configuration-digest proof is a separate prerequisite
before S2.6/S2.7 are checked; neither parser nor instance tests alone close them.

## Ordered changes and tests

- [ ] Characterize starting Worker, application image/version, instance state,
  allowlisted effective configuration and secret binding names/types. Add
  failures for wrong application, multiple slots, unknown state, invalid
  digest/version, missing limits and unexpected binding changes.
- [ ] Compare effective starting configuration with proposed configuration
  before dispatch. `keep_vars` preserves unspecified dashboard variables,
  not variables explicitly supplied by repository configuration. Preserve
  current onboarding and safety settings; unexplained drift stops the release.
  Do not hardcode onboarding secrets as present when they are not configured.
- [ ] Prove one build: disabled command performs the image rollout; enable
  command supplies exactly `--containers-rollout none`. Its application image
  and version must remain unchanged. After bounded acceptance, reconcile the
  running instance version before claiming exact-image success.
- [ ] Add delayed convergence, failed instance, deadline and third-party drift
  tests. Integrate with durable intent/result ordering and retain ownership on
  unknown state; no retries of mutations or unbounded polling.
- [ ] Add rollback regression where Worker is restored but image/application
  or instance differs. Report unknown/not restored, retaining the journal.
  Claim restoration only when all required starting-state evidence matches.
- [ ] Run focused deploy tests, typecheck, lint and composed readiness gate;
  record local versus live proof separately before checking S2.6/S2.8.

## Remaining live boundary

Cloudflare documents that Worker activation precedes Container rollout and
that successful deployment starts rather than completes replacement.
`--containers-rollout=none` skips Container updates. Worker rollback is not
documented proof of image restoration. Do not add an inferred restore command:
exact image recovery needs separately grounded and approved live evidence, or
the result must remain honestly disabled/unknown with retained ownership.

Sources: [Container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/),
[Wrangler Worker commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
