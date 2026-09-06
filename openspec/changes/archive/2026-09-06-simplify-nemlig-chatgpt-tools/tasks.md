## 1. Catalog Contract

- [x] 1.1 Add a complete table-driven MCP catalog test for all 18 new identifiers, titles, descriptions, input guidance, and annotations; verify the focused interface test fails against the old catalog and passes after implementation.
- [x] 1.2 Add negative assertions for every former identifier and prohibited catalog jargon; verify duplicate aliases or cryptic copy fail the focused test.

## 2. Friendly Tool Surface

- [x] 2.1 Rename the discovery, planning, saved-plan, basket-view, visual-picker, and improvement tools plus their exposed input keys and guidance; verify focused MCP interface tests cover each read-only, local-state, and external-write annotation.
- [x] 2.2 Rename every basket review/action pair and map friendly exposed inputs to the existing internal proposal flow; verify existing approval, expiry, fingerprint, replay, failure, and verified-readback tests still pass unchanged in behavior.
- [x] 2.3 Update server routing instructions, Worker expensive-operation classification, picker calls, production acceptance inventory, and all maintained direct consumers; verify a repository search finds former identifiers only in migration history or explicit negative assertions.

## 3. User and Release Documentation

- [x] 3.1 Update the README feature sets and MCP catalog to lead with household actions, and add the one-time ChatGPT refresh/reconnection note; verify every implemented feature remains represented without protocol jargon in ordinary user guidance.
- [x] 3.2 Apply the repository's required alpha version/release metadata update for the breaking catalog rename; verify the package version gate passes without adding dependencies.

## 4. Verification

- [x] 4.1 Run strict OpenSpec validation and the full `pnpm nemlig:production:ready` gate; verify type checking, linting, all tests, privacy checks, packed-package smoke, and Cloudflare dry-run pass without deployment or basket mutation.
- [x] 4.2 Review the final diff for unchanged authentication, approval, quota, rate-limit, circuit-breaker, timeout, retry, one-Container, and kill-switch behavior; record that the change adds no service, request amplification, storage, scaling, or expected operating cost.
