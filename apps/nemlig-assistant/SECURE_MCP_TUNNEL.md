# Auth0-secured private ChatGPT connection

The recommended alpha path runs a loopback-only HTTP MCP server on the Mac,
validates Auth0 access tokens, and reaches it through OpenAI Secure MCP Tunnel.
It creates no hosting resource, public listener, or npm publication. The older
stdio profile remains the rollback path.

## Early-alpha operating model

The private ChatGPT app does not follow Git, `main`, an npm version, or a
deployment automatically. Its current chain is:

```text
ChatGPT developer app and Auth0 sign-in
  -> associated OpenAI Secure MCP Tunnel
  -> local tunnel-client profile: nemlig-auth0-local
  -> http://127.0.0.1:3333/mcp
  -> issuer, audience, signature, expiry, scope, and owner-subject validation
  -> owner-only local Nemlig credentials and account
```

The app is therefore bound to one ChatGPT workspace, one tunnel, the local
computer, and the built JavaScript at the absolute path configured in the
tunnel profile. Pushing a commit or rebuilding `dist/mcp.js` does not replace
code already loaded by a running Node process. The integration is available
only while the local computer and tunnel client are running.

Auth0 authenticates the person opening the ChatGPT connection. It does not
receive or replace the Nemlig username and password; those remain only on the
Mac. The OpenAI tunnel runtime key authenticates the local tunnel process to
OpenAI. These are three separate credentials with separate jobs.

## Auth0 milestone: what changes and what does not

This milestone adds an identity gate to the existing tunnel. It reuses the same
HTTP/OAuth core a hosted deployment can use later, so token validation and MCP
transport work are not throwaway. Hosting will still require a separate decision
about provider, EU region, storage, secrets, recurring cost, and shutdown.

There is no new hosting bill in this step. Stay on the Auth0 Free plan without a
payment method. Before changing that plan or creating any hosted service, stop
and review its exact monthly ceiling and deletion path.

Auth0 access tokens are self-contained JWTs: revoking a browser session or
refresh token prevents future tokens but cannot recall an already issued access
token immediately. Configure a short access-token lifetime (15 minutes for the
alpha) so that window is bounded. The local server also rejects wrong issuer,
audience, signature, expiry, scope, or owner subject before MCP tool dispatch.

## Configure the Auth0-backed local profile

These are the remaining owner-visible Auth0 changes. Before applying them,
review each value in the Auth0 dashboard; none contains a Nemlig credential.

1. Create an Auth0 API whose identifier is the exact public tunnel MCP URL,
   `<PUBLIC_TUNNEL_MCP_URL>` ending in `/mcp`.
2. Add the API permission `use:nemlig-assistant` and set the access-token lifetime
   to 900 seconds.
3. Enable Dynamic Client Registration for the tenant so ChatGPT can register its
   OAuth client. Keep the tenant in the EU region and on Free.
4. Copy the created owner's Auth0 `user_id` from the user details page. This is
   the allow-listed subject, not an email or password.

Create `~/.config/nemlig-assistant/http-auth.env` locally with this shape:

```sh
export NEMLIG_MCP_AUTH0_ISSUER='https://<AUTH0_TENANT>/'
export NEMLIG_MCP_AUTH0_AUDIENCE='<PUBLIC_TUNNEL_MCP_URL>'
export NEMLIG_MCP_AUTH0_OWNER_SUBJECT='<AUTH0_USER_ID>'
export NEMLIG_MCP_PUBLIC_URL='<PUBLIC_TUNNEL_MCP_URL>'
export NEMLIG_MCP_REQUIRED_SCOPE='use:nemlig-assistant'
```

Then protect it and create a second tunnel profile. Reuse the existing tunnel ID
and runtime-key file; never paste either into the environment file or repository.

```sh
chmod 700 ~/.config/nemlig-assistant
chmod 600 ~/.config/nemlig-assistant/http-auth.env

tunnel-client init \
  --sample sample_mcp_with_dcr \
  --profile nemlig-auth0-local \
  --tunnel-id <TUNNEL_ID> \
  --mcp-server-url http://127.0.0.1:3333/mcp \
  --health-listen-addr 127.0.0.1:8081

tunnel-client doctor --profile nemlig-auth0-local --explain
```

The managed Auth0 path supervises both the local HTTP server and tunnel client;
if either exits, `launchd` restarts the pair:

```sh
pnpm nemlig:tunnel:stop
pnpm nemlig:tunnel:auth0:install
pnpm nemlig:tunnel:auth0:status
```

In ChatGPT, refresh the private developer app and follow the discovered Auth0
authorization-code/PKCE flow. Sign in with the Auth0 owner user. Do not enter the
Nemlig username or password in that screen. Prove discovery, sign-in, tool
enumeration, refresh, and read-only tool use before treating this profile as the
active alpha path.

Rollback is local and immediate:

```sh
pnpm nemlig:tunnel:auth0:stop
pnpm nemlig:tunnel:restart
```

That restores the retained `nemlig-local` stdio profile. It does not delete the
Auth0 API, DCR client, user, or tenant; remove those separately in Auth0 only if
the owner decides to retire the identity setup.

Official references:

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

## 1. Verify the local server

From the repository root:

```sh
pnpm --filter nemlig-assistant build
pnpm dlx @modelcontextprotocol/inspector --cli \
  node apps/nemlig-assistant/dist/mcp.js \
  --method tools/list --strict
```

Expect seventeen tools and no schema errors or warnings. This command only discovers
metadata; it does not log in or call a Nemlig tool.

## 2. Create the private tunnel

These are owner actions in the OpenAI Platform UI:

1. Open [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels)
   in the personal Platform organization associated with the target ChatGPT
   account.
2. Create a tunnel and associate the target ChatGPT workspace. The operator
   needs Tunnels Read + Use; creating or editing also needs Tunnels Manage.
3. Create a runtime API key for the tunnel client. Copy the `tunnel_id` and key
   once. Do not paste either into ChatGPT, GitHub, this repository, a profile,
   or a command argument.
4. Download the current `tunnel-client` from Platform tunnel settings or the
   latest public release linked by the official tunnel guide. Do not hard-code
   an old release URL in automation.

The client needs outbound HTTPS to `api.openai.com:443` and local access to the
stdio command. It needs no inbound port.

## 3. Configure the local stdio profile

Build first, then replace `<TUNNEL_ID>` and `<REPO>` below. `<REPO>` must be the
absolute local repository path. The profile is local operator configuration and
must not be committed.

Paste the runtime key into a masked, session-only zsh prompt so it does not enter
shell history:

```sh
read -rs "CONTROL_PLANE_API_KEY?Tunnel runtime API key: "
echo
export CONTROL_PLANE_API_KEY

tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile nemlig-local \
  --tunnel-id <TUNNEL_ID> \
  --mcp-command "node <REPO>/apps/nemlig-assistant/dist/mcp.js"

tunnel-client doctor --profile nemlig-local --explain
```

Do not print the environment, enable shell tracing, or save the key in `.env`,
shell startup files, tunnel profiles, support output, or repository files.

### Recommended unattended setup

The foreground, session-only setup above is useful for first proof. For routine
alpha use, enroll the existing `nemlig-local` profile once from an interactive
terminal:

```sh
pnpm nemlig:tunnel:enroll
```

The command reads the runtime key through a masked prompt, stores it outside the
repository at `~/.config/tunnel-client/nemlig-runtime-key` with mode `0600`, and
installs a per-user macOS LaunchAgent. The LaunchAgent contains only a `file:`
reference to the secret. It starts at login and `launchd` restarts it after a
crash. The key is never printed, passed as a command argument, added to a shell
profile, or committed.

If an approved local secret mechanism has already provisioned that owner-only
file, `pnpm nemlig:tunnel:install` installs the LaunchAgent without prompting or
printing the key.

After that one-time enrollment, Codex or the owner can operate the tunnel
without entering the key again:

```sh
pnpm nemlig:tunnel:status
pnpm nemlig:tunnel:restart
pnpm nemlig:tunnel:stop
```

`restart` rebuilds the Nemlig MCP bundle, replaces the running tunnel process,
and requires a successful control-plane health check before returning.

**Current alpha rule:** the Husky `pre-push` hook runs verification and then
`pnpm nemlig:tunnel:restart` whenever `main` is checked out. A failed restart or
health check blocks the push. Git has no standard client-side `post-push` hook,
so activation happens immediately before the remote update. After a pull,
merge, or dependency update that is not followed by a push, run the restart
manually. Treat an update as inactive until `pnpm nemlig:tunnel:status` reports
health, readiness, and a successful control-plane poll. A later deployment
setup can replace this local trigger.

## 4. Start, connect, and stop

Start the tunnel and keep the terminal open:

```sh
tunnel-client run --profile nemlig-local
```

Use the loopback-only tunnel admin UI at `/ui`, or `/healthz` and `/readyz`, to
confirm the client is healthy, ready, and polling. Then in ChatGPT web:

1. Enable developer mode for the target account/workspace if it is not already
   enabled.
2. Open Apps, create a developer-mode app, choose **Tunnel** as the connection,
   and select the tunnel (or paste its `tunnel_id`).
3. For the legacy `nemlig-local` fallback only, use no separate app-level OAuth.
4. Scan tools and confirm the seventeen tools, their read/write annotations, and the
   warning for state-changing tools before creating the draft app.
5. Test from a new normal ChatGPT conversation. Preparation is not approval;
   approve each unchanged exact apply proposal separately.

Press Ctrl-C in the tunnel terminal to stop. Unset the session key afterward:

```sh
unset CONTROL_PLANE_API_KEY
```

Restart with a freshly entered key and the same `tunnel-client run` command.
When the client is stopped or disconnected, ChatGPT calls fail unavailable;
there is no public or unauthenticated fallback. The verified ChatGPT web path
can remain on the calling state for about five minutes before reporting the
timeout and unavailable result. Restart the client, run `doctor`, and retry
discovery if reconnect does not recover automatically.

## Update and restart the early-alpha app

Repository changes become active only after a clean rebuild and process
restart. From the repository root:

With the recommended unattended setup, run:

```sh
pnpm nemlig:tunnel:restart
```

The following foreground procedure remains the manual fallback:

1. Stop `tunnel-client` with Ctrl-C. This also stops its local MCP child.
2. Confirm the intended source revision is checked out and current:

   ```sh
   git status --short --branch
   git fetch origin main
   git rev-parse HEAD
   git rev-parse origin/main
   ```

   For the normal `main` workflow, the two revisions must match and the worktree
   must be clean. Preserve unrelated work instead of discarding it.
3. If dependencies changed, run `pnpm install --frozen-lockfile`.
4. Build and inspect the MCP tool metadata without logging in:

   ```sh
   pnpm --filter nemlig-assistant build
   pnpm dlx @modelcontextprotocol/inspector --cli \
     node apps/nemlig-assistant/dist/mcp.js \
     --method tools/list --strict
   ```

5. Enter the tunnel runtime key through the masked, session-only prompt from
   section 3, then restart:

   ```sh
   tunnel-client doctor --profile nemlig-local --explain
   tunnel-client run --profile nemlig-local
   ```

6. In ChatGPT, refresh or rescan the draft app when tool definitions changed,
   then test in a new normal conversation. Approved workspace apps keep a
   frozen tool snapshot until an administrator reviews the update.

Verify all three layers rather than trusting a version label alone:

- **Source:** `HEAD` equals the intended remote revision.
- **Runtime:** the MCP process was started after the latest build completed.
- **Behavior:** a read-only canary demonstrates the new behavior. For favorites
  text search, call `list_favorites` with `query: "banan"` and confirm the result
  is filtered. Do not use a basket mutation as an update check.

The package manifest and the server's embedded `NEMLIG_VERSION` can drift in
this early alpha, so neither is sufficient proof that the running process uses
the latest build.

## Later hosted direction

If local-machine availability becomes the limiting factor, a separate approved
change can replace the tunnel-bound process with a hosted Streamable HTTP MCP
endpoint. The Auth0 validation and HTTP transport above can be reused. The
hosted service would additionally need to isolate sessions and proposals, store
credentials in a server-side secret manager, and add durable storage, audit,
rate limiting, and deployment/version evidence.

That is not an automatic upgrade of the current tunnel. It changes the trust,
hosting, identity, privacy, and operational boundaries and therefore requires a
new OpenSpec proposal and explicit approval before implementation. Until then,
the one-account private tunnel described here remains the supported setup.

## Troubleshooting

- Tunnel missing in ChatGPT: verify the target ChatGPT workspace association and
  Tunnels Read + Use permission; permission changes can take time to propagate.
- Discovery or calls fail: keep `tunnel-client run` active, then run `doctor
  --profile nemlig-local --explain` and check `/readyz`.
- Tool definitions changed: rescan or refresh the draft app. Approved workspace
  apps use a frozen tool snapshot until an admin reviews an update.
- Nemlig authentication fails: stop the tunnel and run `pnpm nemlig login --save`
  locally. Never enter Nemlig credentials in ChatGPT or tunnel configuration.
- Inspector reports findings: fix them before connecting ChatGPT; do not waive
  schema errors or warnings for this app.

## Rollback and revocation

1. Stop `tunnel-client` and unset `CONTROL_PLANE_API_KEY`.
   For the managed setup, run `pnpm nemlig:tunnel:stop` instead.
2. Disconnect or delete the private ChatGPT developer app.
3. Delete the tunnel in Platform tunnel settings if it is no longer needed.
4. Revoke the tunnel runtime API key in the owning Platform organization.
5. Confirm ChatGPT can no longer discover or call the app. The local CLI and
   stdio server remain available and no basket state is changed by rollback.
