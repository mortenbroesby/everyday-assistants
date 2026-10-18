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
flow and its add-only basket boundary. Selected products create a temporary
process-local draft; edits stay local. An exact saved Nemlig shopping list can
be loaded as a read-only source without changing or deleting that list. Drafts
expire after two hours of inactivity when unprotected; unresolved work remains
available until resolved, and all process-local drafts disappear after restart.
Only a separately authorized submission adds the exact reviewed draft in one
request and verifies additive basket readback. After verified addition, the
viewer can optionally save the entire current basket as a new list. An uncertain
result must be inspected, never blindly retried. The source for
the server, deployment, and OAuth configuration remains in the Everyday
Assistants repository and its configured providers.

Installing the package does not prove that OAuth, tool discovery, or the
interactive UI works. Verify those separately in a fresh ChatGPT Work
conversation. Search and basket viewing are read-only. A real basket addition
requires an exact reviewed draft, authorization, one protected additive Submit,
and independent basket readback. Never remove or reduce actual basket items,
check out, or pay through this plugin.
