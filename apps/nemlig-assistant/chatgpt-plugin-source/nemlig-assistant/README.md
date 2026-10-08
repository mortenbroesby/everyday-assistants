# Nemlig Assistant private draft

Version 0.1.2. This package contains shopping instructions, the original repository icon, and a required binding to existing app `asdk_app_6ab5680715148191a4e7cebd0ab47123`. It contains no MCP server or credentials. The app and its connection remain independently managed.

The icon is configured in `plugin.json` at `extensions.com.openai.interface.logo` and `composerIcon`, both pointing to `./assets/icon.png`. This is the unchanged 1024 x 1024 PNG embedded as NEMLIG_ICON in the repository's apps/nemlig-assistant/src/mcp.ts.

This archive is a private account/workspace package, not a public-directory submission package. Its existing-app dependency is intentional. Installation in another account requires access to the same app and its own supported authentication. Uploading does not prove connection reuse or interactive view rendering.

Review the workflow in skills/family-grocery-shopping/SKILL.md. Search and basket viewing are read-only. Additions require the existing exact preparation and authorization flow. Real basket removals/reductions, checkout and payment are prohibited.

Verification at creation: existing app profile responded with release 6.1.11 Sage. No product search, Draft list, basket access, preparation or submission was performed. Runtime behavior of this new wrapper remains unverified until installation. The existing app and server were not edited or deployed.
