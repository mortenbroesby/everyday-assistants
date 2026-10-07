## 1. Contract and implementation

- [x] 1.1 Add failing MCP-interface coverage for the restored authenticated
  profile and its runtime release identity; assert no provider interaction.
- [x] 1.2 Restore `get_profile` with the minimal strict result schema and
  remove release identity interpolation from MCP instructions.
- [x] 1.3 Update the durable MCP specification and README inventory to describe
  seven user tools and the live-profile identity boundary.

## 2. Release and verification

- [x] 2.1 Create the required minor version, unique codename, ledger row, and
  reviewed release note; repair the discovered historical duplicate ledger row
  with a focused regression for that one-time migration.
- [x] 2.2 Run focused MCP/runtime tests, package checks, and the applicable
  repository verification gate; review the final diff.
- [ ] 2.3 Deliver one scoped PR. After merge/deploy, refresh ChatGPT metadata
  as needed and invoke `get_profile` in a fresh request; keep historical-card
  behaviour as a separate acceptance boundary.
