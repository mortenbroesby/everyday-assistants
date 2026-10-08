# ChatGPT plugin package source

This directory contains the unpacked source for the Nemlig Assistant
plugin archive. Edit `nemlig-assistant/` here, then build and validate a fresh
ZIP from the repository root:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs
```

The archive is written to the ignored
`apps/nemlig-assistant/dist/plugin/` directory. To choose a download location:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs \
  --output ~/Downloads/nemlig-assistant.zip
```

The packager checks the two manifests agree, the existing app binding is
required, `hosted-app.json` matches the app binding and production Cloudflare
URL/Worker configuration, the logo and composer icon point to the same
package-local 1024×1024 PNG that the existing MCP app uses, the skill and
package README exist, private author email is absent, the canonical
`wrangler.jsonc` is included in the archive as `nemlig-assistant/cloudflare/`,
and the resulting ZIP passes `unzip -t`.

To refresh the committed full package archive after changing source:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs \
  --output apps/nemlig-assistant/chatgpt-plugin-archives/nemlig-assistant-0.1.4.zip
```

The current live archive was downloaded and compared with this tracked source.
Its active plugin files match the source; the empty legacy skill directory was
excluded, and the optional author email from the original private export is
omitted from the public repository. This PR adds the hosted-app restore
reference and Cloudflare config snapshot to that package. The existing app ID
remains in `.app.json` so the archive keeps its required binding to the app
already configured in ChatGPT.
This package contains the plugin wrapper, shopping skill, icon, non-secret
hosted-app restore reference, and a snapshot of the canonical Cloudflare
Worker configuration. It does not contain ChatGPT's hosted renderer or the
remote MCP server implementation. The server and its UI remain maintained
under `src/` and use the existing app build workflow; Cloudflare secrets stay
provider-managed.

The archive is a complete package for import/creation in one upload. Updating
an existing Plugin Creator release uses an overlay; omitted files are not
deleted automatically. A newly created account plugin may receive a new
Plugin Creator record ID, while `.app.json` continues to bind the same existing
hosted app.

The generated uploadable ZIP is committed at
`apps/nemlig-assistant/chatgpt-plugin-archives/nemlig-assistant-0.1.4.zip`.
Rebuild and validate it after changing the source or hosted-app configuration;
the archive is a complete package, not a delta update.
