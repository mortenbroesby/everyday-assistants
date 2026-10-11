# Nemlig Assistant production readiness

Nemlig Assistant uses one credential-free repository gate for production-alpha
evidence:

```sh
pnpm nemlig:production:ready
```

The command runs, in order:

1. strict OpenSpec validation;
2. the public-tree privacy check;
3. root lint, build, type checks, tests, coverage tasks, and smoke tests;
4. the packed private-package interface smoke test; and
5. a Cloudflare production dry run.

It does not read production credentials, contact Nemlig, deploy Cloudflare,
change Auth0 or DNS, publish npm packages, create GitHub issues, or mutate a
basket. CI runs this same command with read-only repository permissions.

## Owner-run live evidence

Owner browser recovery also requires the reviewed public client and separate
portal session secret in the [onboarding runbook](cloudflare-operations.md#owner-browser-entry-prerequisites).
Verify browser POST/cookie handoff and explicit credential validation on the
disabled/onboarding-only revision before enabling MCP. Local OAuth tests and
service fixtures do not establish production owner or provider access.

Live checks remain separate from the automatic gate:

- `pnpm --filter nemlig-assistant production:probe` checks health, revision,
  OAuth metadata, and cheap rejection paths with per-step deadlines, without a
  token. Its bounded JSON report separates requested source from the observed
  revision and includes correlation IDs and the last completed boundary.
- `pnpm --filter nemlig-assistant production:test:features` requires a current
  owner token and a 90-second total budget. It exercises the retained search
  and actual-basket read paths, without
  list writes, proposal preparation/application, feature requests, or basket
  mutation. Obsolete usage/reset endpoints no longer exist; no tier or
  count-based admission evidence is required.
- For the Rejoin connection recovery, verify the new app named
  `Nemlig Assistant (Rejoin)` with authenticated seven-tool discovery before
  retiring the previous Nemlig app. Complete the UI release acceptance below for later releases.
- The app has no live mutation acceptance command. Its basket contract is
  add-only; removals, decreases, replacement, clearing, and inverse restoration
  are prohibited.

Follow [Verify production features and read-only checks](cloudflare-operations.md#verify-production-features-and-read-only-checks).
Repository readiness never authorizes a live check or basket mutation.

## UI release acceptance (required for UI delivery)

A green deployment means the server rollout passed, not that ChatGPT has refreshed
its installed tool catalog or rendered the new interface. The release operator
completes these steps before handing the release to the owner for testing:

1. Verify the exact deployed SHA and automated service acceptance, including the
   candidate's exact viewer HTML and resource CSP. Read the current stable
   viewer URI from `start_product_review` metadata; do not infer it from an old
   runbook, card title, or app Version Id. Published identities older than the
   current viewer remain registered only as inert, read-only documents. The
   machine fixture catalog deliberately excludes local-review and provider-write
   tools.
2. In ChatGPT Settings → Plugins → Nemlig Assistant, select Refresh and wait for
   completion. Read back the actual actions: `start_product_review`,
   `update_product_review`, and `submit_product_review` must exist, with the
   current schemas and resource metadata. For `start_product_review`, record both
   `openai/outputTemplate` and `ui.resourceUri`, then read that exact advertised
   resource. Clicking Refresh or seeing an unchanged app Version Id is not
   evidence of completion.
3. In the intended shopping conversation, open a Local basket using exact IDs
   from a read-only product result. A successful metadata Refresh does not prove
   that an already-open conversation replaced its installed widget HTML: verify
   the current advertised resource URI and rendered viewer in that conversation.
   A fresh conversation alone is also insufficient: it can inherit an older
   installed tool descriptor. If the rendered document is an inert retired card,
   capture the installed descriptor and the resource URI ChatGPT requested before
   retrying, redeploying, reconnecting, or bumping the viewer identity.
4. Follow flows 1–4 of the [native ChatGPT smoke test](nemlig-chatgpt-smoke-test.md):
   verify the single Local basket, tap details, right-to-left swipe replacement,
   inline controls, alternatives, quantities, long-list scrolling, and recovery
   across remounts and conversations. These flows do not write to Nemlig. The
   separately authorized flows 5–6 cover a real addition of more than 50 distinct
   products and exact basket readback; they are not implied by UI acceptance.
5. Reopen/remount a historical card: retired identities must be inert and expose
   no shopping controls. The user reopens the current Draft list conversationally;
   a historical card must not reactivate itself or replay a prior edit. Verify the
   current stable resource and every retired resource are registered, and that
   retired resources render an inert document; report a host-cached or
   host-selected retired document separately from application behavior.
   Run the loopback **Run regression smoke** for outages and process restart;
   it complements the native ChatGPT check and never accesses a real basket.
6. Record deployed SHA, refresh readback, rendered behavior and any failure in
   the PR delivery evidence. Report **UI delivery pending** if any required
   behavior is missing. Do not claim the user can test the new UI yet.

If refresh returns an old catalog, inspect one bounded refresh response and server
release evidence before retrying. Do not replace the app, change credentials,
weaken CSP, or repeatedly redeploy to fix unproven cache problems. Local unit tests
and the standards-only iframe smoke remain complementary; neither substitutes
for this ChatGPT check.

ChatGPT developer-mode metadata updates require the native Refresh step. The
release operator owns that step and verification; automatic propagation into
already-open conversations is not guaranteed. See OpenAI's
[refresh procedure](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata).

## Manual operator actions

Provider and secret actions remain intentionally manual. Use the existing
runbook for [deployment](cloudflare-operations.md#first-deployment-and-current-setup),
[emergency disable](cloudflare-operations.md#emergency-disable-and-re-enable),
[usage and breaker inspection](cloudflare-operations.md#inspect-usage-and-reset-the-breaker),
[principal-policy and secret rotation](cloudflare-operations.md#create-or-rotate-the-private-principal-policy),
[rollback](cloudflare-operations.md#roll-back), and
[removal](cloudflare-operations.md#remove-the-deployment).

## Paste-ready evidence update

The block below is historical evidence from 2026-09-01, not a claim about the
current checkout or live deployment. Current maintenance checks and exact-head
CI links are tracked in the [P2 implementation evidence](../openspec/changes/p2-simplify-nemlig-maintenance/evidence.md).
Repository-only refactor verification does not complete live acceptance.

```text
Nemlig Assistant production-readiness evidence

- Automated repository gate: PASS (`pnpm nemlig:production:ready`, 2026-09-01)
- Implementation commit and exact-head CI: `63d060b0388aa15cd2549147e63264456a7cf9db`
  ([CI passed](https://github.com/mortenbroesby/everyday-assistants/actions/runs/33528527398))
- Live edge probe: NOT RUN unless explicitly recorded
- Authenticated live feature acceptance: NOT RUN unless explicitly recorded
- Reversible basket acceptance: NOT RUN unless separately approved and recorded
- Provider, secret, DNS, publication, GitHub issue, and basket changes: NONE
```
