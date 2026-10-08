# ChatGPT plugin package source

This directory contains the unpacked source for the private Nemlig Assistant
plugin archive. Edit `nemlig-assistant/` here, then build and validate a fresh
ZIP from the repository root:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs
```

The archive is written to the ignored
`apps/nemlig-assistant/dist/plugin/` directory. To choose a download location:

```sh
node apps/nemlig-assistant/scripts/package-chatgpt-plugin.mjs \
  --output ~/Downloads/nemlig-assistant-private-draft.zip
```

The packager checks the two manifests agree, the existing app binding is
required, the logo and composer icon point to the same package-local 1024×1024
PNG that the existing MCP app uses, the skill and package README exist, and the
resulting ZIP passes `unzip -t`.

The optional author email from the original private export is omitted from the
tracked copy. The existing app ID remains in `.app.json` so the archive keeps
its required binding to the app already configured in ChatGPT. This package
contains wrapper metadata, the shopping skill, and its icon; it does not
contain ChatGPT's hosted renderer or the remote MCP server implementation.
The server and its UI remain maintained under `src/` and use the existing app
build workflow.
