# ChatGPT plugin baseline — 2026-10-07

Captured immediately before the **MoJo Shopper** presentation update. This is
a privacy-safe baseline: it deliberately excludes account-holder names,
tokens, OAuth client identifiers, and endpoint details.

## ChatGPT cloud-plugin record

| Field | Observed value |
| --- | --- |
| Plugin record | `plugin_asdk_app_6ab5680715148191a4e7cebd0ab47123` |
| Visibility | Private |
| Display name | `Nemlig Assistant (Rejoin)` |
| Description | `Private Nemlig Assistant — Rejoin recovery.` |
| Plugin version | `1.0.0` |
| ChatGPT app mode | Private development mode |
| Category | Other |
| Website | Unavailable |
| Permission policy | Allow low-risk |
| Connected accounts | One primary account |
| Included apps | One, with the same display name and description |
| MCP URL | `https://nemlig-mcp.broesby.dk/mcp` |
| Authorization | OAuth supported and used |
| App ID | `asdk_app_6ab5680715148191a4e7cebd0ab47123` |
| Version ID | `asdk_app_v_6ab5680715248191b2c7c998c5277bfd` |

## Hosted MCP presentation metadata

| Field | Observed value |
| --- | --- |
| Stable server identifier | `nemlig-assistant` |
| Server title | `Nemlig Assistant` |
| Server version | `6.1.7` |
| Server icons | Not advertised |
| OAuth protected-resource display name | `Nemlig Assistant` |

## Change boundary

The MoJo Shopper update may change only presentation metadata and artwork:
the ChatGPT display name/description, MCP human-readable title, protected
resource display name, and icon metadata. It must preserve the plugin record,
server identifier, endpoint, OAuth registration and scopes, permission policy,
connected account, tools, and all provider/basket behavior.
