# Nemlig Assistant release and ChatGPT authentication findings

## Scope

This note records the investigation that followed the `4.13.1 - Relay`
deployment appearing unavailable in ChatGPT. It is intentionally limited to
repository and privacy-safe runtime facts. It does not contain credentials,
tokens, authorization codes, OAuth state, private Nemlig data, or provider
support output.

The later connector recovery is recorded in
[ChatGPT connector recovery](chatgpt-connector-recovery.md). That record
supersedes the earlier “native acceptance unverified” wording where it says
native proof was subsequently owner-confirmed; the historical failed native
attempts remain useful evidence of the original availability boundary.

## Incident findings

The Worker was not missing. The protected deployment created and enabled the
Worker, Container binding, Durable Object bindings, routes, and secrets. The
incident was caused by a later direct Wrangler deployment:

- The protected release version had `MCP_ENABLED=true`.
- A manually uploaded version used the Wrangler configuration default
  `MCP_ENABLED=false` and received 100% traffic.
- The protected production workflow then restored the enabled Worker from the
  exact current `main` revision.
- Cloudflare retained the earlier versions as rollback history; only the
  version receiving 100% traffic served requests.

The production deployment procedure is therefore:

1. Merge to `main` and wait for exact-head CI.
2. Use the protected `Nemlig production` workflow.
3. Let the workflow perform preflight, disabled-first deployment, acceptance,
   enablement, recovery finalization, and release publication when applicable.
4. Never run `wrangler deploy --env production` or the unguarded
   `cloudflare:deploy` shortcut against production.
5. Verify `/healthz`, `/revision`, protected-resource metadata, and anonymous
   `/mcp` rejection before investigating ChatGPT.

The Worker can wake a sleeping Container. A sleeping Container does not make
the Worker disappear and does not explain ChatGPT's "disabled for execution"
message. The old `Continuity` identity was the prior `4.12.1` release; the
current application identity is `4.13.1 - Relay`. Seeing the old identity is
consistent with stale ChatGPT metadata or an old OAuth connection.

## OAuth boundary diagnosis

The hosted path has four separable boundaries:

1. ChatGPT refreshes the existing app metadata and starts OAuth.
2. Auth0 authorizes the owner and issues a token.
3. The Worker discovers the protected resource, validates the bearer token,
   scope, issuer, audience, algorithm, expiry, and principal.
4. The Worker admits and forwards the authenticated MCP request to the fixed
   Container.

The Worker cannot prove a browser-side OAuth failure when no request reaches
it. The correct diagnosis is to correlate a bounded reconnect attempt across
ChatGPT, non-secret Auth0 event categories, and Worker request evidence. If
there is no Worker request after Auth0 success, the failure is before resource
server authentication. Interactive ChatGPT reconnection and two fresh
read-only conversations remain owner/browser acceptance steps; they cannot be
performed safely from this terminal session.

## Comparison with the official Apps SDK example

Compared with
`openai/openai-apps-sdk-examples/authenticated_server_python` and the MCP
TypeScript SDK:

| Area | Nemlig implementation | Result |
| --- | --- | --- |
| Public MCP URL | Stable HTTPS `/mcp` resource URL | Aligned |
| Protected-resource metadata | RFC-style metadata at the path derived from `/mcp` | Aligned |
| Auth challenge | `Bearer resource_metadata="..."` with a reconnect error | Aligned |
| Authorization server | Auth0 discovery with issuer, audience, RS256, scope, expiry, and JWKS validation | Aligned and stricter |
| PKCE | Delegated to Auth0 and ChatGPT | Now fail-closed if Auth0 discovery does not advertise `S256` |
| Endpoint transport | Auth0 authorization, token, and JWKS endpoints | Now fail-closed unless HTTPS |
| Resource identity | Resource URL and authorization server | Adds explicit `resource_name: "Nemlig Assistant"` at the Worker edge |
| Tool auth metadata | OAuth security schemes on the MCP tools | Aligned for this private, authenticated app |
| State changes | Review/apply separation and owner policy | Stricter than the demo example |
| Runtime architecture | Worker gateway, fixed Container, Durable Objects, quotas, breaker, kill switch | More complex; requires guarded deployment and readback |

The official example does not make the Worker an OAuth provider. It exposes
protected-resource metadata and returns the MCP authentication hint while an
external authorization server owns authorization and token issuance. Nemlig
follows that same boundary; adding OAuth endpoints to the Worker would expand
the attack surface and is not required.

## Repository changes on this branch

- Auth0 discovery now rejects non-HTTPS authorization, token, or JWKS
  endpoints.
- Auth0 discovery now rejects providers that do not advertise PKCE
  `S256`, which is required for the ChatGPT authorization-code flow.
- Worker protected-resource metadata now includes the stable display identity
  `Nemlig Assistant`.
- Focused tests cover the accepted discovery document and both fail-closed
  rejection cases.

These checks do not change Auth0 configuration, credentials, callbacks, the
owner identity, production resources, or basket behavior.

## Prevention checklist

- Keep one existing ChatGPT app; refresh metadata rather than creating a
  duplicate.
- Reconnect OAuth after a compatible deployment when ChatGPT reports an
  expired or unavailable connection.
- Treat a release as live only after exact revision, enabled health, metadata,
  anonymous rejection, and read-only authenticated acceptance are recorded.
- Keep historical Cloudflare versions until a replacement has passed acceptance
  and a rollback path is deliberately retired.
- Keep production deployment behind the protected workflow; direct Wrangler
  production uploads bypass the safe `MCP_ENABLED` default and can silently
  disable execution.
- Never infer a missing Worker from a sleeping Container or stale ChatGPT
  app label.
