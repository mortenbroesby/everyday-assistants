# Private ChatGPT connection

This runbook connects the local stdio server to one private ChatGPT developer
app through OpenAI Secure MCP Tunnel. It creates no public listener and does not
publish the app or npm package.

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
2. Disconnect or delete the private ChatGPT developer app.
3. Delete the tunnel in Platform tunnel settings if it is no longer needed.
4. Revoke the tunnel runtime API key in the owning Platform organization.
5. Confirm ChatGPT can no longer discover or call the app. The local CLI and
   stdio server remain available and no basket state is changed by rollback.
