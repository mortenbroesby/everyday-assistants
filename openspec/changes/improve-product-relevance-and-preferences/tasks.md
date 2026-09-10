## 1. Characterize Planning Failures

- [x] 1.1 Add a failing planning test that returns relevant minced meat plus cat food and verify the cat-food candidate is currently eligible.
- [x] 1.2 Add failing tests for a 1 kg request across 500 g and 800 g packages and verify package counts, coverage, and excess are currently absent.
- [x] 1.3 Add failing tests for a Heinz preference and an explicit unresolved brand choice and verify current price-first behavior does not satisfy them.

## 2. Filter and Rank Candidates

- [x] 2.1 Add the minimum normalized contradiction filter for pet-product categories and text and verify relevant human-food candidates remain eligible.
- [x] 2.2 Parse supported mass, volume, and count package sizes and verify equivalent units, package counts, coverage, excess, unsupported formats, and dimension mismatches.
- [x] 2.3 Rank exact preferred brands, sufficient low-excess combinations, existing preferences, and price in that order and verify deterministic ties.
- [x] 2.4 Update automatic clarity so explicit-choice lines and candidates without required amount evidence remain unresolved, verified by focused planning tests.

## 3. Extend the MCP Contract

- [x] 3.1 Add backward-compatible requested-amount, unit, preferred-brand, and explicit-choice inputs and verify invalid combinations fail before provider reads.
- [x] 3.2 Return package-combination and preference evidence with clear resolution reasons and verify published output schemas accept real results and reject malformed data.
- [x] 3.3 Update tool guidance so clients preserve user amounts and stated brands, and do not silently choose on explicit-choice lines; verify the interface contract test.

## 4. Document and Verify

- [x] 4.1 Update the Nemlig README feature summary with relevance, amount, and conversational preference behavior and verify removed saved-shopping behavior is not reintroduced.
- [x] 4.2 Run focused planning and MCP tests, `openspec validate improve-product-relevance-and-preferences --strict --no-interactive`, and root `pnpm verify`; resolve every in-scope failure.
- [x] 4.3 Refresh changed files in jCodeMunch, review references and the final diff, bump the required Nemlig version, then commit, push, and verify the remote branch SHA.

## 5. Production Acceptance

- [x] 5.1 After production deployment is authorized, deploy through the protected workflow and verify the exact accepted revision without weakening cost or mutation safeguards.
- [ ] 5.2 In the supplied ChatGPT conversation, verify minced meat excludes pet food, 1 kg shows 500 g and 800 g package trade-offs, Heinz wins when preferred, an unpreferred brand-sensitive line offers a useful bounded choice, and the basket remains unchanged.
- [ ] 5.3 Record accepted production evidence, finalize the deployment lease, sync and archive the OpenSpec change, and verify exact-main CI is green.
