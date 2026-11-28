# Local read-only Nemlig provider check

Use this optional operator check when changing the provider client, credential selection, or hosted MCP transport. It uses a real Nemlig account through the development Worker and Container. Run the synthetic conversation journey for routine widget and routing changes.

## Prepare the local stack

Use the Node, pnpm, Colima and trusted loopback TLS setup in [Local authenticated MCP proof](local-auth-colima.md). Use a dedicated checkout and development Auth0 API/client. From the repository root build the candidate with `pnpm --filter nemlig-assistant build`. Create an ignored `apps/nemlig-assistant/.dev.vars` with mode 0600. Configure the following values privately.

| Variable | Development value |
| --- | --- |
| `NEMLIG_MCP_PUBLIC_URL`, `NEMLIG_MCP_AUTH0_AUDIENCE` | `https://127.0.0.1:8787/mcp` |
| `NEMLIG_MCP_AUTH0_ISSUER` | Development Auth0 issuer over HTTPS |
| `NEMLIG_MCP_PRINCIPALS` | One-line schema-v3 JSON containing revision, owner_subject, and one enabled principal with that exact subject and a unique 32–64 character base64url principal_key |
| `NEMLIG_MCP_CREDENTIAL_KEY`, `NEMLIG_MCP_ONBOARDING_SESSION_KEY` | Two independently generated private 32-byte base64url keys |
| `NEMLIG_MCP_CREDENTIAL_KEY_VERSION` | `local-v1` |
| `NEMLIG_MCP_ONBOARDING_CLIENT_ID` | Development public PKCE client ID with form-post callback `https://127.0.0.1:8787/connect/callback` |
| `NEMLIG_MCP_REVISION` | `local` (selects the local Container binding) |
| `MCP_ENABLED`, `MCP_CREDENTIAL_ONBOARDING_ENABLED` | `true` |
| `NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED` | `false` |

With the project's dependencies installed and a trusted certificate covering 127.0.0.1, run the following from `apps/nemlig-assistant`. Put the certificate and key at the paths below as described in the local TLS runbook.

```sh
pnpm auth:local:doctor
DOCKER_HOST=unix://${COLIMA_HOME:-$HOME/.colima}/default/docker.sock \
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" \
pnpm exec wrangler dev --local --local-protocol https --ip 127.0.0.1 --port 8787 \
  --https-key-path .codex/local-auth/tls/local-key.pem \
  --https-cert-path .codex/local-auth/tls/local.pem \
  --persist-to .codex/local-auth/provider-state
```

Obtain a short-lived development user access token for the loopback audience and `use:nemlig-assistant` scope through the approved development OAuth client. Open **https://127.0.0.1:8787/connect** directly, select **Sign in** and complete development owner sign-in, and enter the selected account's Nemlig login in that local portal. Saving the connection validates the account and stores its sealed credentials in this local Worker state. Use the local portal to revoke the development connection when retiring the state.

## Run and interpret

From the same package directory in another zsh terminal, enter the development bearer token at the masked prompt. The subshell releases the variable on exit.

```zsh
(
  read -rs 'NEMLIG_LOCAL_MCP_ACCESS_TOKEN?Development MCP access token: ' || exit 1
  echo
  export NEMLIG_LOCAL_MCP_ACCESS_TOKEN
  export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
  pnpm auth:local:provider
)
```

The command allows 90 seconds. A pass requires a connected account, a banana search returning a positive product ID, nonblank name and numeric price, and a successful basket read. An empty basket passes. A nonzero exit identifies the failing stage and omits account data. Record the source commit and local Container image ID alongside the summary. This check exercises laptop egress and development OAuth. Hosted OAuth settings, Cloudflare egress and ChatGPT rendering each need their own acceptance evidence.
