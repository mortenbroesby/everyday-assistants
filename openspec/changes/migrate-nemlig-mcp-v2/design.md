## Context

At issue #72's verified source base (`68f00137664d706ee0e5f0245b06efb7633f98c2`), `http.ts` authenticates and authorizes requests, retains provider/review services in an application context map, then creates an SDK v1 transport and server only for `initialize`. A separate session map owns protocol continuation. The Worker and gateway classify bounded requests before forwarding them. The issue is the execution contract; this design records only the architectural decisions needed to implement it.

## Goals / Non-Goals

**Goals:** use the selected SDK v2 standard request handler for both current protocol eras, remove protocol-session lifecycle code, and retain security-sensitive application state across requests only within its authenticated principal and current policy/credential generation.

**Non-Goals:** redesign Nemlig authentication or the hosting topology; add a durable store, endpoint, framework, or protocol parser; alter product features owned by #93; or perform live provider/basket acceptance.

## Decisions

1. **Use one standard modern-only handler and factory.** Mount `createMcpHandler(factory, { legacy: 'reject' })` through the supported Node adapter behind the existing Express host/origin protections, bearer verifier, principal checks, and admission. Pass the already parsed Express body to the adapter so it does not read the consumed request stream again. Keep the canonical `/mcp` path; do not add application-level negotiation or a second protocol path. The SDK entry itself does not authenticate or authorize.

2. **Separate request context from server instances.** Derive principal, policy revision, credential generation, and validated request credentials after authentication on every request. Key the retained `PrincipalContext` by the server-derived principal identity plus current policy revision and credential generation. Reuse its provider client and basket-review service only for that exact scope, invalidate stale contexts, and preserve the existing principal capacity bound. Give the shared handler a unique request-scoped authentication context that resolves to the validated application context; keep decrypted credentials request-local and never select context from a client-supplied identity. The factory creates a fresh MCP server for each request. A process restart may lose an unfinished review; it must fail closed and require a new review rather than infer approval or retry an uncertain write.

3. **Migrate only packages actually imported.** Use a compatible, published stable v2 package set for server, owned clients, public protocol schemas, and the existing Express/Node integration as needed. Declare required framework peers directly. Do not install `server-legacy`, a second web framework, or private SDK internals. Use the official codemod only after recording its exact version and previewing its app-scoped diff; complete all manual diagnostics and audit source, tests, scripts, package output, and lockfile before removing the v1 package.

4. **Keep the Worker policy authoritative.** Preserve bounded parsing, trusted credential-header stripping/forwarding, authentication-before-wake, quota/admission, kill switch, and the service tool allowlist. Add only the supported modern discovery/message shapes to credential-free or service classification. Derive operation and tool permissions from a validated bounded request body; protocol headers may be checked for contradictions but cannot grant profile access or override a write body. Forward required protocol metadata unchanged.

5. **Prove the selected protocol explicitly.** Use a client pinned to `2026-07-28` against the actual HTTP adapter and canonical endpoint. Exercise discovery and real tools, not compilation alone. Reuse synthetic clients and assert mutations/readback without any configured path to real Nemlig credentials or provider traffic. Other protocol revisions and legacy clients are outside the target and receive no compatibility implementation or test suite.

6. **Preserve semantic errors and request capabilities.** Map v1 SDK/auth errors to v2 public error types while keeping existing OAuth, principal, infrastructure, and protocol failure distinctions. Preserve structured tool schemas, semantic `isError`, cancellation, deadline behavior, and any retained elicitation/resource capability through supported request-scoped APIs. Do not force JSON-only responses where a retained capability requires streaming.

7. **Keep implementation and rollout evidence separate.** The PR will record the exact resolved packages, test outcomes, limitations, and rollback identity. Decide the release version near merge and add its concise release note under the package policy. CI and credential-free Cloudflare dry runs do not prove live compatibility. Merge/deployment approval and any real provider operation remain distinct; a code rollback cannot reverse a basket write.

## Risks / Trade-offs

- **A request context is accidentally shared across principals or generations** → key retained services only from authenticated server-derived values, replace stale scopes, and test interleaved principals plus rotation.
- **Express parsing consumes the body before the SDK handler sees it** → pass the parsed body using the documented adapter seam and cover it in real HTTP tests.
- **Gateway admits an operation from a misleading header** → classify the bounded body, reject inconsistent metadata, and test profile/read headers paired with a write body at the Worker/gateway composition.
- **A restart removes an uncompleted review** → keep reviews process-local under the existing service, fail closed on absence, and never retry an uncertain mutation.
- **A v2 package/API change alters established tool or auth behavior** → characterize current contracts first, migrate in coherent checkpoints, and verify schemas, errors, service allowlists, and package smoke against synthetic fixtures.

## Migration Plan

1. Record the exact head, manifests, SDK call sites, tool catalogues, and context/session behavior; add the cross-request positive and negative HTTP regressions first.
2. Resolve compatible published v2 versions and peers; migrate source, tests, scripts, error mapping, registration, stdio, and package smoke while the existing HTTP lifecycle remains available as an intermediate checkpoint.
3. Move context lookup to every authenticated request, preserve principal/policy/generation scoping, and make the request-scoped credentials distinct from the retained provider/review context.
4. Replace the custom session transport lifecycle with the shared modern-only stateless handler and adapter, then update Worker/gateway classification and forwarding.
5. Run modern end-to-end HTTP tests, synthetic write/readback and failure cases, packaged stdio/HTTP smoke, repository gates, privacy/spec validation, and credential-free Cloudflare dry run on the final candidate.
6. Reconcile the current OpenSpec transport requirements. Deliver one issue #72 branch and PR from the current main head. Follow the repository's release, merge, CI, and deployment gates; rollback to the recorded prior verified deployment if a separately authorized rollout fails.

## Open Questions

None. Resolve exact compatible package versions, adapter peers, and codemod release from the configured registry during implementation, as required by issue #72.
