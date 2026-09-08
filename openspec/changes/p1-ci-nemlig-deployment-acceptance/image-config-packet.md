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
