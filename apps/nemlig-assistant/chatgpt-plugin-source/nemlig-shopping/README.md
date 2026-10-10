# Nemlig Assistant

This private plugin connects to the existing Nemlig MCP server at
`https://nemlig-mcp.broesby.dk/mcp`. The server advertises its OAuth resource
and authorization server. The package includes the repository's icon and a
shopping skill; it does not include credentials or server code. The upload ZIP
adds a snapshot of the canonical `wrangler.jsonc` as a restore reference; it
does not deploy it. The smaller `assets/connector-icon.png` is derived from the
same icon for ChatGPT's custom MCP registration form.

`plugin.json` is the portable plugin manifest. `.app.json` binds this package
to the registered ChatGPT MCP app; `mcp.json` names the remote Streamable HTTP
server for portable clients. The skill under `skills/` describes the shopping
flow and its add-only basket boundary. It also covers durable owner-scoped
Local baskets (up to 50 baskets, 500 distinct product lines per basket, with a
24-hour sliding expiry) and the explicit append-or-create choice for new
grocery requests. A verified successful real-basket submission deletes the
Local basket; uncertain or partial attempts remain inspect-or-delete only. The
source for the server, deployment, and OAuth configuration remains in the
Everyday Assistants repository and its configured providers.

Installing the package does not prove that OAuth, tool discovery, or the
interactive UI works. Verify those separately in a fresh ChatGPT Work
conversation. Search and basket viewing are read-only. A real basket addition
requires the server's exact preparation, authorization, apply, and readback
flow. Never remove or reduce actual basket items, check out, or pay through
this plugin.
