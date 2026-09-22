## 1. Baseline and regression

- [x] 1.1 Record the actual base/head, clean task worktree, resolved SDK versions, all app-owned SDK imports, current human/service tool inventories, and any #93 overlap; verify findings against source and `origin/main`.
- [x] 1.2 Add an HTTP regression where principal A reviews additions in one request/client, then applies from a new client/request; verify the exact synthetic mutation happens once and readback matches.
- [x] 1.3 Add negative HTTP cases for principal B, policy revision change, and credential-generation change; verify no unrelated principal context or provider mutation is affected.
- [x] 1.4 Run the new tests against the untouched v1 baseline and record the expected failing cross-request case without attributing pre-existing failures to the migration.

## 2. SDK v2 packages and APIs

- [x] 2.1 Resolve and record the mutually compatible stable v2 versions and direct peers from the configured registry; verify selected package export maps and engine compatibility.
- [x] 2.2 Preview an app-scoped official codemod at a recorded version, apply only reviewed mechanical changes, and manually resolve every diagnostic; verify the diff contains no broad or unrelated rewrite.
- [x] 2.3 Migrate server registration, context access, schemas, headers, errors, OAuth metadata/verifier types, and owned clients; verify with focused tests and `pnpm --filter nemlig-assistant check`.
- [x] 2.4 Replace the registration override with typed registration/local helper, preserve the human and service tool inventories and all profile/review/product schemas, and verify the existing interface tests.
- [x] 2.5 Remove the v1 SDK declaration only after source, tests, scripts, build output, and lockfile contain no owned v1 imports; verify with repository-wide app-scoped searches and package resolution.

## 3. Principal-scoped application context

- [x] 3.1 Resolve the existing provider/review context on every authenticated request using server-derived principal, policy revision, and credential generation; verify positive cross-request review/apply with fresh MCP server instances.
- [x] 3.2 Keep decrypted credentials and the validated request context request-local; invalidate stale scopes and enforce the existing capacity bound; verify interleaved-principal and generation-rotation tests.
- [x] 3.3 Verify a process restart loses only process-local unfinished review state, fails closed, and never retries an uncertain mutation.

## 4. Stateless HTTP and modern protocol

- [x] 4.1 Mount one standard v2 stateless handler and Node adapter behind the existing Express origin/auth/principal checks; pass the already parsed body and verified auth through supported seams; verify an authenticated local HTTP request reaches the synthetic handler.
- [x] 4.2 Remove the application-owned transport/session map, initialize-only construction, session-ID branches, and lost-session recovery; verify there are no remaining owned HTTP session references.
- [x] 4.3 Test a client explicitly pinned to `2026-07-28` through discovery and tool call without initialize/session ID; verify the modern tool semantics. Do not add older-protocol compatibility or legacy-client tests.
- [x] 4.4 Verify cancellation, deadlines, response completion, required streaming capabilities, handler shutdown, and body parsing against the actual HTTP adapter.

## 5. Worker and gateway policy

- [x] 5.1 Support modern discovery and protocol metadata while keeping bounded body parsing and request-derived operation classification; verify gateway unit tests for modern requests and unsupported operations.
- [x] 5.2 Preserve profile/service allowlists, admission, quotas, kill switch, internal credential stripping, and header/body consistency; verify contradictory profile/read headers paired with a write body are rejected before provider access.
- [x] 5.3 Exercise Worker/gateway-to-HTTP composition with synthetic data; verify malformed, oversized, unsupported, unauthenticated, disallowed, and quota-limited requests fail closed.

## 6. Local serving and shipped consumers

- [x] 6.1 Migrate stdio startup and package smoke to the supported v2 serving/client APIs; verify packaged stdio starts without protocol-breaking stdout and retains the established tool behavior.
- [x] 6.2 Migrate acceptance scripts, test helpers, injected client seams, and remaining SDK consumers; verify all owned imports resolve only to the selected v2 package set.
- [x] 6.3 Preserve supported resources, elicitation/capability-sensitive helpers, annotations, structured results, and semantic `isError`; verify each retained capability through its supported request-scoped behavior or bounded fallback.

## 7. Final proof and delivery

- [x] 7.1 Run the issue's focused HTTP, auth, proposal, runtime, gateway, and interface test set; verify identity isolation, invalidation, single-use/replay, write readback, product/profile contracts, and no real-provider path.
- [x] 7.2 Run `pnpm --filter nemlig-assistant build`, `check`, `smoke:package`, root `pnpm verify`, `pnpm privacy:check`, `pnpm spec:validate`, and `pnpm --filter nemlig-assistant cloudflare:check` on the final relevant diff; record any unavailable platform proof precisely.
- [x] 7.3 Reconcile the OpenSpec transport requirements and review the final diff for v1 remnants, secrets, accidental product changes, and complexity; verify strict OpenSpec validation.
- [ ] 7.4 Decide the package release version near merge, add the reviewed release note, commit scoped checkpoints, push the dedicated branch, open one PR, and verify required CI and the eventual integrated `main` revision under repository delivery rules.
