## 1. Restore catalogue-first discovery

- [ ] 1.1 Change whole-list planning to search current catalogue inventory for every ordinary line without loading favourites, and verify focused planner tests cover loose search wording, multi-line candidates, ambiguity, basket gaps, and zero favourite calls.
- [ ] 1.2 Keep explicit favourite browsing independent, cache complete discovered products by ID, and resolve an explicitly selected cached product without repeating text discovery; verify the observed differently worded favourite regression is covered.
- [ ] 1.3 Preserve catalogue transport failures as `discovery_unavailable` while keeping successful empty searches as `no_eligible_candidate`; verify mixed multi-line results remain usable and no proposal or basket mutation occurs.

## 2. Relax only latency restrictions

- [ ] 2.1 Configure a 90-second hosted total, an 85-second backend ceiling, and a 60-second window for each Nemlig API interaction with retries only after early read transport failures; verify normal slow responses are not cut short and authentication, mutation non-retry, quotas, breaker, kill switch, one-Container ceiling, and cost bounds remain unchanged.
- [ ] 2.2 Update MCP instructions, tool descriptions, README feature inventory, backlog, timeout documentation, and affected active OpenSpec artifacts so catalogue-first and the single generous ceiling are described consistently; verify strict OpenSpec validation passes.

## 3. Verify and deliver

- [ ] 3.1 Run focused planner, client, MCP, Cloudflare configuration, gateway, privacy, and acceptance tests, then run `pnpm verify`, privacy checking, and the production-readiness gate without any live basket mutation.
- [ ] 3.2 Review the diff for accidental favourites fallback, false missing-product classification, unbounded work, retry amplification, weakened approval or owner controls, extra capacity, secret exposure, and material cost increase; commit and push the scoped change and verify exact-head CI.
- [ ] 3.3 With explicit production approval, deploy the exact verified revision disabled first, prove both routes fail closed and the Container is inactive, enable the same revision, and verify edge plus read-only catalogue planning and exact selected-product reuse through the existing ChatGPT app.
