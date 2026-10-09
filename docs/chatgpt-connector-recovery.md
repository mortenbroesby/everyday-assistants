# ChatGPT connector recovery record

## Status

Recovery completed on 2026-09-22. This record describes the working
ChatGPT-to-production-MCP path and the failure that preceded it. It is a
privacy-safe operational record: it contains no tokens, cookies,
authorization codes, client secrets, Auth0 subjects, profile IDs, request
bodies, or Nemlig credentials.

The repository implementation was already the correct resource-server
boundary. The recovery required repairing the external ChatGPT/Auth0 client
association; it did not require another OAuth framework, another Worker, or a
new MCP URL.

Related evidence:

- [Issue #71](https://github.com/mortenbroesby/everyday-assistants/issues/71)
  records the implementation and local Colima proof.
- [Issue #81](https://github.com/mortenbroesby/everyday-assistants/issues/81)
  records the connector recovery and production acceptance.
- [Local authenticated MCP proof](local-auth-colima.md) records the
  development-only Worker-to-Container test and its parity limits.

## Canonical configuration

These values are part of the intended connection. A future repair must verify
them before changing anything:

| Boundary | Value or rule |
| --- | --- |
| MCP endpoint | `https://nemlig-mcp.broesby.dk/mcp` |
| Resource/API audience | The same canonical MCP URL |
| Auth0 issuer | `https://everyday-assistants.eu.auth0.com/` |
| Human permission | `use:nemlig-assistant` |
| OAuth flow | Authorization Code with S256 PKCE |
| Client registration | ChatGPT's public CIMD metadata imported as an Auth0 third-party client |
| Accepted operation at the time | Authenticated, read-only `get_profile` with empty input |

The Worker is a protected resource server. Auth0 and the OAuth-capable client
own browser login, authorization-code exchange, PKCE, refresh, and client
registration. The Worker validates the bearer token, issuer, audience,
signature/algorithm, time claims, required permission, and application
principal before MCP dispatch. It does not implement browser login or exchange
authorization codes.

Nemlig provider credentials are a separate concern. The acceptance operation
does not require a Nemlig login, wake provider-backed functionality, read
shopping data, or mutate a basket, order, payment, or delivery.

## Layer ownership and diagnosis

For this deployment, the ChatGPT app is a saved remote-MCP connection, not a
copy or symlink of the server. It stores the MCP endpoint and OAuth connection
association/settings, then discovers tool schemas and UI-resource metadata
from the endpoint; the host may retain metadata or already-rendered cards. A
plugin ZIP is a separate packaging/import mechanism and is not the routine
release artifact for this connection.

```text
ChatGPT connection
  -> Cloudflare Worker (edge token checks, policy/admission, routing)
  -> fixed Container-backed Durable Object (runs MCP tools/resources)
```

Auth0 handles OAuth authorization/client registration and issues tokens; the
Worker and Container validate the bearer token at their respective boundaries.
The Nemlig owner connection is a separate encrypted provider session used only
when a tool calls Nemlig. It is not the ChatGPT OAuth login. Routine server
releases deploy the reviewed Worker and Container application through the
repository workflow, not by uploading a plugin ZIP.

## Viewer identity and forward-only cutover

The live Draft list resource has one permanent identity:
`ui://nemlig/shell.html`. The previous `ui://nemlig/draft-list.html`, the former
unversioned product-viewer URI, and v1-v16 are permanently inert, read-only
resources. The stable shell loads the fixed-origin, content-addressed bundle
from the no-store manifest when mounted; it does not hot-swap code in an active
shopping card. Do not rotate a URI to try to invalidate a ChatGPT cache, and do
not infer current rendered code from a successful deployment, resource read,
or metadata refresh.

For the approved forward-only cutover, first deploy reviewed code and retain
the exact source/artifact evidence. The operator then cleanly installs or
reconnects the intended existing MCP endpoint and opens a new chat. Record the
installed descriptor and the native build marker separately. Do not automate
disconnect, consent, OAuth registration, provider login, or retry loops. Old
cards remain unsupported: a host-cached document cannot be erased remotely.

Use evidence to select the layer before changing it:

1. Confirm the actual ChatGPT connection, exposed action, and configured MCP
   endpoint. A selected connector pill does not prove a tool was invoked.
2. Correlate the call with sanitized Worker evidence. A Worker HTTP 200 means
   an HTTP response completed; inspect the returned JSON-RPC/tool result for
   `isError` or a structured error before calling the MCP operation successful.
   `/revision` proves only the gateway's configured revision, not the Container
   image or what ChatGPT rendered.
3. Investigate Auth0 when there is OAuth/token evidence, such as authorization,
   consent, token exchange, issuer/JWKS, or token-validation failure. A tool
   that passed authentication and failed during a Nemlig operation is not, by
   itself, evidence for changing Auth0.
4. If the MCP tool reached the Nemlig client and a provider request failed,
   trace that operation in source: endpoint, query/body parameters, and the
   session-derived context refreshed from the current owner session. Reproduce
   at most once with a bounded read-only check where safe. Fix the application
   only when a focused regression demonstrates an application request defect;
   investigate the owner session only when the provider error indicates
   provider authentication/session state. Keep raw provider bodies and
   shopping data out of logs/support notes.
5. For stale UI or actions, compare fresh `tools/list` metadata and the live UI
   resource URI/document with what ChatGPT actually requested and rendered.
   Refresh metadata only when stale schemas/resources are demonstrated. A
   refresh acknowledgement is not proof of rendered content.
6. Upload/replace a plugin package only if an app-level configuration change
   is required and evidence confirms that this ChatGPT integration is updated
   from that package. A ZIP download/upload menu alone is not evidence.

## What failed

The first failing boundary was the old ChatGPT connector registration, before
the resource server:

1. The old installed `Nemlig Assistant` record had no connected account and no
   exposed tools.
2. Reconnect caused ChatGPT to generate a new URL-form/DCR client identifier.
3. Auth0 rejected that client as unknown before login or consent.
4. No bearer request reached the Worker, so this was not evidence of a bad
   issuer, audience, scope, principal policy, Container, or Nemlig provider
   credential.

The same boundary explains the earlier ChatGPT symptoms: “plugin
unavailable”, an attached pill without an invokable action, and the absence of
an authenticated Worker request. `OAUTH_OWNER_PROFILE_ID_MISSING` was a
downstream host/linking symptom in the earlier flow, not a reason to invent an
anonymous profile, add arbitrary OIDC claims, or weaken token validation.

The precise internal reason the old ChatGPT registration was not persisted or
reused is host-side and is not observable from this repository. The
demonstrated root cause is narrower and actionable: the ChatGPT app's client
registration was not associated with a client Auth0 could resolve.

## Resolution

The owner-approved correction was deliberately limited to the broken
association:

1. Removed the stale ChatGPT developer app record after confirming that it had
   no connected account or usable tools.
2. Created one fresh `Nemlig Assistant` connector using the canonical MCP URL
   and OAuth settings.
3. Kept the existing Auth0 tenant, resource/audience, human permission, and
   Worker implementation.
4. Used ChatGPT's public CIMD metadata URL to create one Auth0 third-party
   client. The metadata supplied the exact ChatGPT callback, public-key
   authentication method, authorization-code/refresh grants, and RS256
   signing configuration. No client secret was copied into the repository.
5. Completed one owner-controlled Auth0 consent flow for the existing
   user-delegated permission.
6. Refreshed the connector metadata and verified exactly one exposed tool:
   `get_profile`, with an empty object input schema and the
   `use:nemlig-assistant` OAuth requirement.

This is why “create a new client” was necessary even though the Auth0 tenant
already existed: a tenant/resource-server configuration does not by itself
make every ChatGPT-generated client ID a registered client. The new CIMD
registration made the actual ChatGPT client resolvable by Auth0 while keeping
the resource server unchanged.

## Verification evidence

### Server and local implementation

Issue #71 records the exact-head local proof using the repository-pinned
Wrangler entry point, the actual Container controller, the production
Dockerfile/runtime, and Colima. It also records the negative and restart
checks. The local proof does not claim production routing or ChatGPT connector
behavior.

The implementation commit for that proof was `48d62ea`. The production Worker
acceptance recorded in issue #81 ran on Worker version
`a188c546-bd05-4b0a-acde-0ed1d29a7298`. A retained earlier Worker version was
`f9dadeb2-2790-49db-ab4d-66a8dd9438bc`; retain rollback artifacts until a later
replacement has independently passed acceptance.

### Production ChatGPT path

Two fresh ChatGPT Work conversations invoked only `get_profile`; both returned
the same non-empty stable profile result. The second request was observed
through a live production Worker tail. The privacy-safe event sequence was:

```text
request received
→ bearer present
→ token accepted
→ principal authorized
→ MCP reached
→ get_profile called
→ get_profile completed (HTTP 200)
→ MCP completed (HTTP 200)
```

Native ChatGPT acceptance was also owner-confirmed and recorded separately in
issue #81. Native and web acceptance are separate evidence planes; neither
should be inferred from the other.

No provider-backed Nemlig operation appeared in the acceptance evidence. No
basket, order, payment, delivery, proposal, or other business mutation was
performed.

## Future repair runbook

The steps below apply only when the connector itself is unavailable before a
tool call is authenticated. For an authenticated MCP call that fails during a
Nemlig search/provider operation, follow the layer-diagnosis sequence above;
do not assume this historical Auth0 registration failure has recurred.

When ChatGPT reports that this connector is unavailable, do not start by
changing Worker authentication or recreating the MCP endpoint.

1. Inspect the actual ChatGPT app, persistent MCP integration, connected
   account, and exposed actions. A selected connector pill is not proof that a
   callable tool exists.
2. Inspect the Auth0 client association for the actual ChatGPT registration.
   A URL-form/DCR client ID that Auth0 reports as unknown is a registration
   failure before login, not a bearer-validation failure.
3. Verify the canonical endpoint, issuer, audience, permission, and exact
   callback from the current CIMD metadata. Never guess callbacks or add
   wildcard callbacks.
4. Prefer repairing the existing association. If the association is
   demonstrably unrecoverable, use the approved one-connector CIMD replacement
   procedure. Do not create a parallel connector or second MCP URL.
5. For release 6.1.0 and later, refresh metadata and verify that the seven-tool
   catalog, including `get_profile`, is exposed before attempting a user
   conversation.
6. Perform one bounded, fresh authenticated MCP discovery and correlate it
   with the privacy-safe Worker sequence above. Test provider access separately
   with `check_nemlig_connection` when credentials are provisioned.
7. Stop changing authentication after that call succeeds. Treat provider
   access, shopping functionality, and long-term refresh behavior as separate
   tests.

Do not record or request passwords, access tokens, cookies, authorization
codes, client secrets, raw callback query strings, Auth0 subjects, profile IDs,
or captured request bodies. Do not use a manually supplied bearer token as a
substitute for the OAuth-client-to-resource-server proof.

## Recovery and rollback

The safe rollback unit is the external association, not the Worker code:

- Keep the working connector, Auth0 client, production Worker version, and
  earlier Worker version until a replacement has passed the same acceptance.
- If a future connector repair fails, restore the recorded ChatGPT/Auth0
  association or reconnect the same intended connector. Do not delete the
  working client as cleanup.
- A Worker rollback cannot repair a missing ChatGPT registration.
- Revoking consent or deleting a client can invalidate runtime sessions and may
  not restore the original identifier. Obtain exact owner approval before any
  disconnect, revoke, delete, or replacement action.

## Not proven by this record

This recovery proves authenticated `get_profile` through the intended
ChatGPT-to-Worker path. It does not prove a real Nemlig login, provider data
access, basket behavior, checkout/order/payment/delivery behavior, long-lived
refresh/expiry behavior, Cloudflare global placement, or every future ChatGPT
release. Those remain separate, explicitly bounded tests.
