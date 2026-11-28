## Context

The routing fixture hosts the MCP server over loopback and counts forbidden provider calls. The browser smoke exercises the built widget. Wrangler and Colima already run the hosted stack locally.

## Decisions

Use one fixture process for the model and widget so identifiers and edits share a lifetime. Observe successful tool results and grade the rendered product, identity, quantity readback and forbidden-call count. Distinguish deterministic transport checks from model trials. Keep real credentials in an isolated operator-managed local hosted stack with its own OAuth and onboarding settings.

## Risks

Native host versions, model sampling, and provider assortment vary. Report failed and unavailable stages explicitly. ChatGPT-specific rendering, installed connector state and production ingress still require targeted hosted checks.

The native host represents absent tool-result metadata as a nullable field. Omit an absent value and validate the reconstructed result against the MCP SDK result schema before passing it to the widget. Preserve populated metadata and structured content. Enable draft creation only for the ephemeral synthetic fixture in the native host configuration.
