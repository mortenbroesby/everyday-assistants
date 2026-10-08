# Nemlig Assistant

Version 0.1.4. This package contains the complete plugin manifests, shopping
instructions, the original repository icon, the required binding to existing
app `asdk_app_6ab5680715148191a4e7cebd0ab47123`, and `hosted-app.json` with the
public MCP/OAuth URLs and Cloudflare Worker identity. The private account's
original author email is intentionally omitted from the tracked copy.

The icon is configured in `plugin.json` at `extensions.com.openai.interface.logo` and `composerIcon`, both pointing to `./assets/icon.png`. This is the unchanged 1024 x 1024 PNG embedded as NEMLIG_ICON in the repository's apps/nemlig-assistant/src/mcp.ts.

The generated ZIP is the complete plugin package for import/creation in one
archive, not a delta. The app binding still depends on the existing hosted app.
The ZIP records the public connection settings and includes a snapshot of the
canonical Cloudflare Worker config at `cloudflare/wrangler.jsonc`, but upload
cannot create the hosted app or deploy its Worker. That config snapshot refers
to server source paths supplied by the repository; the source and deployment
workflow remain in the repository. Cloudflare and Auth0 secrets remain in
their provider stores and are never included here. Plugin Creator updates to
an existing release are overlays; omitted files are not deleted.

This package is configured for personal or workspace use through the existing
app connection, not as a public-directory submission. Its existing-app
dependency is intentional. Installation in another account requires access to
the same app and supported authentication. Uploading does not prove connection
reuse or interactive view rendering.

Review the workflow in skills/grocery-shopping/SKILL.md. Search and basket viewing are read-only. Additions require the existing exact preparation and authorization flow. Real basket removals/reductions, checkout and payment are prohibited.

The canonical hosted-app configuration is maintained in
`apps/nemlig-assistant/wrangler.jsonc`. `hosted-app.json` is a small,
package-local restore reference and is checked against that file when building
the ZIP. Restoring the Cloudflare runtime still uses the existing repository
deployment workflow, not the plugin archive.

No product search, Draft list, basket access, preparation or submission was
performed for this package. The existing app and server were not edited or
deployed.
