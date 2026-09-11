# Acceptance evidence

## Production delivery — 2026-09-12

- Runtime fixes merged through protected pull requests
  [#27](https://github.com/mortenbroesby/everyday-assistants/pull/27),
  [#28](https://github.com/mortenbroesby/everyday-assistants/pull/28),
  [#29](https://github.com/mortenbroesby/everyday-assistants/pull/29), and
  [#30](https://github.com/mortenbroesby/everyday-assistants/pull/30).
- Exact merge commit `e9161e0d2f4b6d2810456459706e8385255be98b`
  passed [CI run 34655842500](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34655842500).
- [Production run 34655953255](https://github.com/mortenbroesby/everyday-assistants/actions/runs/34655953255)
  deployed `4.5.5-alpha.66`, Worker version
  `171e8026-59da-495c-a11b-1a4c7106866f`, and Container application version
  `47`. The bounded release report recorded green edge and service acceptance,
  enabled final state, and no rollback.
- The local production-readiness gate passed strict OpenSpec validation,
  privacy, lint, build, typecheck, 313 coverage tests, five representative smoke
  tests, packed-package smoke, and the Cloudflare production dry run.

## Sequential ChatGPT acceptance

- [Small recipe run](https://chatgpt.com/c/6aa4881b-2e48-83eb-95bc-30387548f918)
  reviewed 14 products and identified one genuinely unresolved cocoa line. It
  reported no visible tool error and did not inspect or mutate basket, account,
  order, checkout, or delivery data.
- The first large run after deployment showed that ChatGPT still cached the old
  tool schema. The plugin was refreshed through its existing developer-mode
  Refresh action, and its displayed `review_proposed_basket` schema then included
  `search_term`.
- [Refreshed 24-item run](https://chatgpt.com/c/6aa48a49-7504-83ed-81a3-5e88d8112242)
  preserved all English ingredient labels, reviewed products with the matching
  Danish search terms, accepted 22 reasonable products, and left salmon and
  yoghurt unresolved. It reported no visible tool error, no review-group retry,
  and no basket or account access or mutation.
- The two accepted runs executed sequentially. Neither reported authentication
  nor rate-limit errors, so the existing rate and cost ceilings remain unchanged.

No live Nemlig basket mutation was authorized or performed.
