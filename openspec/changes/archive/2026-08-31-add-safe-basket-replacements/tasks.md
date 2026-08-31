## 1. Replacement Proposal Core

- [x] 1.1 Add the exact replacement operation, review payload, and factual price-difference arithmetic to the existing proposal service; verify focused tests cover valid preparation, an already-present replacement line, same-ID rejection, absent old line, unavailable or incomplete replacement data, and zero mutation during preparation.
- [x] 1.2 Revalidate the full basket and replacement product inside the existing mutation lock, then set and verify the replacement quantity before removing and verifying the old line; verify focused tests assert exact call order and no old-line removal before successful replacement readback.
- [x] 1.3 Consume and sanitize failed or uncertain replacement applications without compensation or retry; verify tests cover add failure, add readback mismatch, removal failure, removal readback mismatch, replay, expiry, connection mismatch, and basket or product drift.

## 2. MCP Interface

- [x] 2.1 Add structured replacement proposal and result schemas plus `prepare_cart_replacement`; verify MCP tests cover exact review fields, signed price differences, read-only annotations, invalid input, sanitized errors, and no mutation during preparation.
- [x] 2.2 Register `apply_cart_replacement` through the existing apply path with destructive and open-world annotations; verify MCP tests cover explicit proposal IDs, verified completion, replayed known results, indeterminate guidance, and absence of any direct replacement mutation tool.
- [x] 2.3 Update tool-list and compatibility assertions while leaving the picker and local CLI unchanged; verify existing addition, removal, clear, planning, picker-enabled, and picker-disabled tests still pass.

## 3. Documentation and Release

- [x] 3.1 Document exact replacement review, potential-savings wording, add-first partial-state behavior, and the unchanged explicit approval boundary; verify public-tree checks expose no credentials, local paths, basket contents, or private proposal data.
- [x] 3.2 Run the read-only Nemlig release plan, apply the required additive alpha version bump, and verify `pnpm --filter nemlig-assistant check:version-bump --base origin/main` accepts the runtime diff.

## 4. Verification and Delivery

- [x] 4.1 Run `pnpm exec openspec validate add-safe-basket-replacements --strict --no-interactive` and focused Nemlig tests, confirming all fixtures are synthetic and no live basket is contacted or changed.
- [x] 4.2 Run `pnpm verify` from the repository root and resolve every failure without weakening proposal validation, explicit approval, or readback requirements.
- [x] 4.3 Review the final diff against every delta-spec scenario, commit the completed scoped change to `main`, push it, and verify `origin/main` resolves to the delivered commit.
- [x] 4.4 Hand off a concise owner alpha exercise for preparing one cheaper and one non-cheaper replacement, reviewing quantities and package metadata, and optionally applying one separately approved exact proposal; record live discrepancies as follow-up work rather than bypassing safety checks.
