## 1. Lock the presentation contract

- [x] 1.1 Add focused MCP tests for basket view plus add, remove, replace, and clear prepare/apply results, verifying concise Danish-friendly text excludes proposal UUIDs, product IDs, expiry timestamps, internal status names, and raw field labels while `structuredContent` remains exactly schema-complete.
- [x] 1.2 Add picker contract coverage proving it consumes structured tool results, retains opaque proposal data only for apply, and renders no ID or expiry text in ordinary review and verified-result copy.

## 2. Implement the smallest dual-channel presentation

- [x] 2.1 Extend the existing success-result helper with optional text and add small operation-specific money, line, proposal, and basket formatters using platform APIs; verify the focused tests cover all four mutation operations and same-name/package disambiguation.
- [x] 2.2 Apply friendly text only to basket view, preparation, and verified apply results while leaving every output schema and structured field unchanged; verify existing proposal, production-acceptance, and MCP tests still pass.
- [x] 2.3 Update the embedded picker to prefer `structuredContent` with its existing JSON-text reader as a fallback, and simplify its proposal/result wording; verify picker accessibility and interaction tests pass.
- [x] 2.4 Update server instructions and affected tool descriptions to avoid repeating technical fields and to ask once for unchanged approval, while preserving every existing mutation prohibition and safety instruction; verify metadata snapshots and tool inventory tests pass.

## 3. Document and release the feature

- [x] 3.1 Update the Nemlig README examples and maintained feature inventory, remove the shipped item from `BACKLOG.md`, and explain how to request technical detail; verify links and the repository documentation checks pass.
- [x] 3.2 Apply the repository's Nemlig runtime feature-version policy without enabling publication; verify release-policy tests classify the scoped runtime change correctly.

## 4. Verify and deliver

- [x] 4.1 Run the focused Nemlig package checks, `pnpm verify`, and strict all-change OpenSpec validation; resolve every failure without weakening approval, privacy, authentication, or Cloudflare cost controls.
- [x] 4.2 Review the final diff for secret exposure, technical identifiers in ordinary presentation, picker regressions, request amplification, dependency additions, or cost-safety changes; verify the public-tree/privacy checks and Cloudflare dry-run remain clean.
- [x] 4.3 Commit the completed scoped work to `main`, push it, verify `origin/main` equals the exact local SHA, and verify exact-head CI before production promotion.
- [x] 4.4 Promote the exact verified build through the existing single-Container Cloudflare workflow, refresh the installed `Nemlig Assistant` app, and verify representative basket view and prepare-only ChatGPT conversations are friendly without applying a basket mutation; record the acceptance evidence and keep rollback available.
