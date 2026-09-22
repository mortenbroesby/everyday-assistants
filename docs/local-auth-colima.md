# Local authenticated MCP proof

This runbook is development-only. It exercises the repository Worker, the
`NemligMcpContainer` controller, and the production `Dockerfile` through the
repository-pinned Wrangler CLI and a local Colima Docker engine. It never uses
`--remote`, production bindings, production secrets, a real Nemlig account, or
the production ChatGPT connection.

## Responsibilities

Auth0 and the selected OAuth client own Universal Login, authorization-code
exchange, S256 PKCE, refresh, and client registration. The MCP resource server
only discovers the configured issuer, verifies a bearer access token with
`jose` and the MCP SDK contract, checks the intended audience, RS256, expiry,
scope, and application principal, and then admits the request before the
Durable Object or Container can wake.

Nemlig credentials are a separate provider concern. Existing schema-v2
credential records remain sealed in the fixed controller Durable Object with
AES-GCM, bound to principal, policy revision, key version, and generation. The
encryption key is an existing Worker secret. No Cloudflare Secret Store or
competing credential database is introduced: moving ciphertext or plaintext to
another facility would require a separately approved migration, rotation,
revocation, local-development, access-control, and existing-data plan.

The credential portal no longer performs Auth0 login, authorization-code
exchange, refresh, organization, invitation, or ID-token validation. When that
disabled feature is explicitly enabled, it accepts a standard resource bearer
token and then uses a short-lived signed portal cookie only for the provider
credential form. Invitation registration remains a separate #69 dependency;
source records and existing encrypted data are not deleted by this reset.

## Local prerequisites

Use Node `22.23.1`, pnpm `9.15.9`, Wrangler `4.127.1`, and the pinned MCP SDK
and `jose` versions in `apps/nemlig-assistant/package.json`. The active Docker
context must be Colima, with a running development profile and enough storage
for the production image. Do not reset Colima, prune shared Docker resources,
or change its allocation as part of this proof.

Create the ignored local file and fill it with an owner-approved development
Auth0 issuer, API audience, test principal subject, and a freshly generated
development-only encryption key:

```sh
cp apps/nemlig-assistant/.dev.vars.example apps/nemlig-assistant/.dev.vars
pnpm --filter nemlig-assistant auth:local:doctor
```

The local resource URL and API audience must be the same HTTPS loopback
`/mcp` URL. The principal policy is local-only and does not contain a real
Nemlig credential. `MCP_CREDENTIAL_ONBOARDING_ENABLED` stays false.

## Start and calibrate

From the repository root, run:

```sh
pnpm --filter nemlig-assistant auth:local:start
```

This uses the normal `wrangler dev` Worker entry point, local Durable Object
state under `.codex/local-auth/wrangler-state`, the real Container binding, and
the app `Dockerfile`. It listens only on `127.0.0.1:8787`; Container port 8080
is internal and is never an OAuth resource URL. For local simulation only, the
Worker selects the ordinary local DO binding instead of the production EU
jurisdictional subnamespace; production keeps the EU placement constraint.
The Container image binds its HTTP listener before Auth0 discovery completes so
Wrangler's local proxy can retry startup without changing production behavior.

When using a trusted mkcert certificate, start Wrangler with the task-local
certificate and Colima socket explicitly:

```sh
DOCKER_HOST=unix:///Users/macbook/.colima/default/docker.sock \
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" \
pnpm exec wrangler dev --local --local-protocol https --ip 127.0.0.1 --port 8787 \
  --https-key-path .codex/local-auth/tls/local-key.pem \
  --https-cert-path .codex/local-auth/tls/local.pem \
  --persist-to .codex/local-auth/wrangler-state
```

In another terminal, run:

```sh
pnpm --filter nemlig-assistant auth:local:test
```

This is only calibration: health and protected-resource metadata must succeed,
and anonymous MCP initialization must return a standard 401 without waking the
Container. It is not authenticated proof.

## Real OAuth proof

Use one pinned OAuth-capable Inspector release whose callback is registered in
the development Auth0 client. Connect with Streamable HTTP to the local
external `/mcp` URL, not port 8080. Start without a cached client credential;
follow the resource challenge and complete hosted Universal Login and consent.
The client must return through its Authorization Code + S256 PKCE callback and
then issue `initialize`, `ping`, and `tools/list` with the returned access
token. Record only stage outcomes, UTC timestamps, source SHA, Worker request
references, and the actual Container image ID/digest. Never record tokens,
codes, cookies, claims containing personal data, or captured traffic.

The proof is complete only when the authenticated request is observed entering
the Worker, passing principal admission, reaching the actual rebuilt Container
image and `dist/http.js`, and returning a complete MCP response. It must not
perform a Nemlig login, decrypt a real account, call a provider-backed tool, or
mutate a basket, order, payment, or delivery.

The deterministic negative and recovery matrix is separate from this browser
step: anonymous, malformed/forged/expired/wrong issuer/audience/algorithm,
missing expiry/subject, missing scope, unknown or disabled principal, spoofed
internal headers, JWKS outage, rotated key, Container/Worker restart, and
missing Nemlig credentials must all remain distinct bounded outcomes. Fixture
tests may prove validation categories; only the OAuth client can prove real
issuance, expiry, refresh or same-client reauthorization.

## Honest parity limits

| Local evidence | Still not proved |
| --- | --- |
| Same Worker, controller, Container class, Dockerfile, entry point, verifier, and policy | Cloudflare global routing, placement, quotas, billing, or production storage |
| Colima Docker image ID/architecture and completed MCP response | Production image rollout or ChatGPT's existing connector registration |
| Real development Auth0 token through loopback Worker ingress | Production Auth0 settings, production token, or Nemlig provider access |
| Protocol `initialize`/`ping` without provider credentials | A successful Nemlig login, grocery read, or ChatGPT connector call |

## Primary references

- [Auth0 MCP authorization](https://auth0.com/ai/docs/mcp/get-started/authorization-for-your-mcp-server)
- [Auth0 MCP Inspector guide](https://auth0.com/ai/docs/mcp/guides/test-your-mcp-server-with-mcp-inspector)
- [Auth0 Authorization Code + PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
- [Auth0 access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OpenAI authentication](https://developers.openai.com/plugins/build/auth)
- [Cloudflare local Container development](https://developers.cloudflare.com/containers/guides/local-dev/)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Colima FAQ](https://colima.run/docs/faq/)
