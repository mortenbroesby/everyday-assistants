# Private ChatGPT connection

This runbook connects the local stdio server to one private ChatGPT developer
app through OpenAI Secure MCP Tunnel. It creates no public listener and does not
publish the app or npm package.

## Early-alpha operating model

The private ChatGPT app does not follow Git, `main`, an npm version, or a
deployment automatically. Its current chain is:

```text
ChatGPT developer app
  -> associated OpenAI Secure MCP Tunnel
  -> local tunnel-client profile: nemlig-local
  -> node <REPO>/apps/nemlig-assistant/dist/mcp.js
  -> owner-only local Nemlig credentials and account
```

The app is therefore bound to one ChatGPT workspace, one tunnel, the local
computer, and the built JavaScript at the absolute path configured in the
tunnel profile. Pushing a commit or rebuilding `dist/mcp.js` does not replace
code already loaded by a running Node process. The integration is available
only while the local computer and tunnel client are running.

This is the intended early-alpha trade-off: it avoids hosting account
credentials or exposing a public MCP endpoint while the product and safety
workflow are still changing. For unattended operation, a macOS user LaunchAgent
can keep this same private chain alive; it does not change the trust boundary.

Official references:

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

## 1. Verify the local server

From the repository root:

```sh
pnpm --filter nemlig-shopper build
pnpm dlx @modelcontextprotocol/inspector --cli \
  node apps/nemlig-assistant/dist/mcp.js \
  --method tools/list --strict
```

Expect ten tools and no schema errors or warnings. This command only discovers
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

After that one-time enrollment, Codex or the owner can operate the tunnel
without entering the key again:

```sh
pnpm nemlig:tunnel:status
pnpm nemlig:tunnel:restart
pnpm nemlig:tunnel:stop
```

`restart` rebuilds the Nemlig MCP bundle, replaces the running tunnel process,
and requires a successful control-plane health check before returning.

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
3. Use no separate app-level OAuth for this single-account private boundary.
4. Scan tools and confirm the ten tools, their read/write annotations, and the
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
   pnpm --filter nemlig-shopper build
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
endpoint. Auth0 or another standards-based OAuth/OIDC provider could then
authenticate each ChatGPT user. The hosted service would need to authorize and
map that identity to an explicitly linked Nemlig account, isolate sessions and
proposals per user, store credentials in a server-side secret manager, and add
revocation, audit, rate limiting, and deployment/version evidence.

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
