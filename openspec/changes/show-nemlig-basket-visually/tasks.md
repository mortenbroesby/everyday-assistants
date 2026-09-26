## 1. Failing contract checks

- [x] 1.1 Add MCP tests for visual basket metadata, bounded exact reads, partial/mismatched details, empty/large baskets, and unchanged normal basket behavior; verify the new cases fail before implementation.

## 2. Visual basket implementation

- [x] 2.1 Add the read-only visual basket tool and bounded enrichment using existing product views; verify MCP tests pass with zero basket writes.
- [x] 2.2 Make the shared viewer label the actual basket, show quantities and missing images, and verify a local browser smoke renders six product rows and images.
- [x] 2.3 Update gateway/service inventories and acceptance tests; verify service and production read-only checks stay within their budgets.

## 3. Delivery evidence

- [x] 3.1 Update ChatGPT instructions, feature documentation, version and release note; verify release and OpenSpec checks pass.
- [ ] 3.2 Run focused tests, a representative MCP/browser end-to-end smoke, and final `pnpm verify`; inspect the diff for safety and secrets.
- [ ] 3.3 Commit and push the scoped branch, open one issue-linked PR, verify exact-head CI/ruleset, and merge if permitted; verify the resulting main SHA. Production deployment remains a separate approval gate.
