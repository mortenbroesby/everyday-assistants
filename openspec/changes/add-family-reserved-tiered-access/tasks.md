## 1. Private policy and cost preflight

- [x] 1.1 Implement a bounded versioned principal-policy parser with unique
  subjects and opaque keys, exactly one enabled Tier 0 owner, valid tier order,
  complete per-principal credentials, and no legacy fallback for invitees;
  verify malformed, duplicate, oversized, missing, and cross-account fixtures
  fail closed without logging secret values.
- [x] 1.2 Recheck official Cloudflare Container, Worker, Durable Object, log, and
  Auth0 pricing; record current versus proposed maxima and verify no new provider,
  paid feature, capacity, or higher hard ceiling is required before continuing.

## 2. Authenticate and admit before wake

- [x] 2.1 Return the validated Auth0 subject from the existing issuer, audience,
  signature, expiry, and scope verification path; verify forged, expired,
  wrong-audience, wrong-scope, and missing-subject tokens remain rejected.
- [x] 2.2 Resolve enabled principals at the Worker before Durable Object access
  and retain Container-side verification from the original bearer token; verify
  unknown, disabled, malformed, and caller-supplied identity cases never call
  admission, wake the Container, or contact Nemlig.
- [x] 2.3 Extend the existing atomic usage record with bounded per-principal and
  per-tier minute/day/month counts, deterministic month-end forecast, Tier 0
  reserves, and ordered Tier 2 then Tier 1 shedding; verify thresholds, resets,
  policy revisions, and concurrent final-allocation requests.
- [x] 2.4 Keep the global kill switch, breaker, quotas, CPU/subrequest limits,
  deadlines, and bounded retries authoritative over tier admission; verify
  invalid tier totals fail configuration and no tier can bypass or raise a
  global safeguard.

## 3. Isolate principal runtime and stored state

- [x] 3.1 Replace the hosted shared client and proposal service with a bounded
  authenticated-principal context map while leaving the local CLI unchanged;
  verify two synthetic principals use different credentials, cookie sessions,
  baskets, favourites, and proposal stores.
- [x] 3.2 Bind every MCP transport and proposal lifecycle to the authenticated
  opaque principal key and policy revision; verify cross-principal session and
  proposal reuse returns the same non-sensitive refusal without mutation.
- [x] 3.3 Scope named lists and new hosted plan snapshots by opaque principal key,
  permit legacy UUID-only plan read-through only for Tier 0, and migrate by copy;
  verify a second principal cannot infer, read, overwrite, archive, restore, or
  migrate the first principal's plans or lists.

## 4. Evidence and operator workflow

- [x] 4.1 Add fixed tier and denial-reason fields to privacy-safe terminal events
  and owner-only aggregate usage output; verify logs and responses contain no
  subject, principal key, credential, per-principal count, prompt, shopping data,
  or unbounded value.
- [x] 4.2 Document owner-only policy creation and rotation, disabled invitee
  staging, two-account read-only isolation acceptance, enablement, rollback, and
  recovery without printing or committing secrets; verify the public-tree check
  rejects synthetic identity and credential fixtures.
- [x] 4.3 Update the feature documentation, backlog status, production acceptance,
  deployment safety validation, and package version for owner-only default
  delivery; verify no invitee is configured or enabled by repository content.

## 5. Verification and delivery

- [x] 5.1 Run focused policy, authentication, admission, concurrency, HTTP,
  proposal, storage, observability, and config tests plus diff checks, strict
  OpenSpec validation, privacy checks, `pnpm verify`, package smoke, and the
  credential-free production-readiness gate; record every passing command.
- [ ] 5.2 Reconcile current `origin/main` and active sibling work, commit and
  integrate the scoped implementation into remote `main`, and verify exact-head
  CI succeeds without changing any provider or production secret.
- [ ] 5.3 With current owner authentication and explicit secret-rotation and
  production authority, install an owner-only policy, deploy the exact CI-green
  revision disabled first, verify rejection and inactive Container state, enable
  the same image, and prove Tier 0 read-only behavior, unchanged limits,
  aggregate evidence, and rollback readiness without Nemlig mutation.
- [ ] 5.4 Sync the delta specs, archive the completed change, integrate the
  repository-only archival commit into remote `main`, and verify exact-head CI;
  leave Tier 1 and Tier 2 activation documented but disabled until a separately
  approved real-user isolation exercise succeeds.
