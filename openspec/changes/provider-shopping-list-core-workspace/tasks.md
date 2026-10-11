## 1. Mandatory provider-list submission

- [x] 1.1 Fail closed when the hosted Local basket cannot prepare a provider-list submission; never use the direct per-product fallback.
- [x] 1.2 Add client and durable-flow tests proving native list endpoint use and no fallback.
- [x] 1.3 Update the feature inventory to describe the mandatory transfer.

## 2. Provider-backed workspace

- [ ] 2.1 Add a minimal owner-bound workspace registry containing only provider list IDs and submission metadata.
- [ ] 2.2 Back To decide and Ready item membership and quantities with separate provider lists and exact post-mutation readback.
- [ ] 2.3 Switch product-review reads, edits, alternatives, clear, and recovery to the provider-backed workspace.
- [ ] 2.4 Retire Durable Object line-content persistence and its callback capability without migrating old Local baskets.

## 3. Protected transfer and verification

- [ ] 3.1 Remove the remaining hosted direct per-product proposal application branch.
- [ ] 3.2 Add focused uncertainty, cross-list mutation, restart, and no-retry regression coverage.
- [ ] 3.3 Run the affected application checks and strict OpenSpec validation.
- [ ] 3.4 After deployment, run an explicitly authorized live workspace-to-basket acceptance; record the exact release and readback without exposing shopping data.
