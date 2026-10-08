# Nemlig Assistant plugin source

The `nemlig-shopping/` directory is the source for the private ChatGPT plugin.
It contains the package manifest, the registered ChatGPT MCP app binding, the
portable remote MCP endpoint, the shopping skill, and the repository icon. It
does not contain credentials or deploy the Cloudflare Worker.

From the repository root, build the ZIP with:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs
```

The output is `apps/nemlig-assistant/dist/plugin/nemlig-shopping-0.1.3.zip`.
To rebuild the tracked upload artifact after changing the source:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs \
  --output apps/nemlig-assistant/chatgpt-plugin-archives/nemlig-shopping-0.1.3.zip
```

The packager checks the endpoint against `wrangler.jsonc`, the local skill and
icons, and ZIP integrity. It also snapshots the canonical Worker configuration
under `cloudflare/` for restore reference; the ZIP does not apply that config.
`assets/icon.png` is the package logo;
`assets/connector-icon.png` is a 256 x 256 copy of that repository icon sized
for ChatGPT's 10 KB custom MCP form. The server's OAuth discovery and actual
tool/UI behavior still need live connection checks. Keep the plugin private
and unshared.

OpenAI's [connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
and [package guide](https://developers.openai.com/plugins/build/plugins) define
the setup:

1. In ChatGPT Plugins, add a custom MCP server with the production `/mcp` URL
   from `wrangler.jsonc`. Use OAuth with the discovered Auth0 endpoints,
   Client Identifier Metadata Document registration, and the advertised
   `use:nemlig-assistant` scope. Use `assets/connector-icon.png` for the icon.
2. Copy the new `plugin_asdk_app_…` ID from its ChatGPT URL. In `.app.json`,
   bind the corresponding `asdk_app_…` ID; update the packager's binding check.
3. Increase `plugin.json`'s version, build the ZIP, and create or update the
   private package plugin through Plugin Creator. Connect the account, then
   test a read-only tool in a new ChatGPT Work conversation.

The separate ChatGPT app registration holds OAuth settings and the connected
account. The ZIP cannot recreate that hosted registration by itself. It binds
the registered app to the shopping skill and portable MCP settings. ChatGPT
Work web currently exposes the registered app; the package page offers an
"Open in desktop app" link. Updating the ZIP does not update the remote
server; deploy that separately through the repository's existing workflow.
