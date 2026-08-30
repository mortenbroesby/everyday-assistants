## 1. Favorites Matching

- [x] 1.1 Add a dependency-free Danish locale-aware product-name matcher over a bounded favorites pool, preserving source order and applying the result limit after filtering; verify focused tests cover `BANAN` matching `Økologiske bananer`, multiple matches, no match, and limit behavior.

## 2. Existing Interfaces

- [x] 2.1 Extend `favorites` with an optional query while preserving no-query listing; verify CLI interface tests cover both paths and no basket method is called.
- [x] 2.2 Extend read-only `list_favorites` with an optional query and pass matches through existing candidate tagging; verify MCP tests cover matching, empty and multiple results, annotations, and no preparation or application call.

## 3. Verification

- [x] 3.1 Run `pnpm exec openspec validate search-nemlig-favorites --strict --no-interactive` and `pnpm verify`, confirming the scoped tests and repository gates pass without live credentials or basket mutation.
