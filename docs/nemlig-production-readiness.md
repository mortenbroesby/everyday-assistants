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

Live checks remain separate from the automatic gate:

- `pnpm --filter nemlig-assistant production:probe` checks health, revision,
  OAuth metadata, and cheap rejection paths with per-step deadlines, without a
  token. Its bounded JSON report separates requested source from the observed
  revision and includes correlation IDs and the last completed boundary.
- `pnpm --filter nemlig-assistant production:test:features` requires a current
  owner token and a 90-second total budget. It exercises read-only paths,
  including catalogue planning and at most one favorite result, without
  list writes, proposal preparation/application, feature requests, or basket
  mutation. It also verifies that `/admin/usage` returns only bounded aggregate
  Tier 0/1/2 counts and headroom without identity or credential fields.
- For the Rejoin connection recovery, verify the new app named
  `Nemlig Assistant (Rejoin)` with an authenticated `get_profile` read before
  retiring the previous Nemlig app. Complete the UI release acceptance below for later releases.
- `pnpm --filter nemlig-assistant production:test:mutation` requires separate
  exact approvals for a mutation and its inverse restoration.

Follow [Verify production features and approved reversible
mutations](cloudflare-operations.md#verify-production-features-and-approved-reversible-mutations).
Repository readiness never authorizes a live check or basket mutation.

## UI release acceptance (required for UI delivery)

A green deployment means the server rollout passed, not that ChatGPT has refreshed
its installed tool catalog or rendered the new interface. The release operator
completes these steps before handing the release to the owner for testing:

1. Verify the exact deployed SHA and automated service acceptance, including the
   candidate's exact viewer HTML and resource CSP. When the self-contained
   viewer HTML, JavaScript, or CSS changes, bump
   `PRODUCT_VIEWER_RESOURCE_VERSION` so the resource URI cannot silently reuse
   stale host-cached widget content. The machine fixture catalog deliberately
   excludes local-review and provider-write tools.
2. In ChatGPT Settings → Plugins → Nemlig Assistant (Rejoin), select Refresh and
   wait for completion. Read back the actual actions: `start_product_review`,
   `update_product_review`, and `submit_product_review` must exist, with the
   current schemas and resource metadata. Clicking Refresh or seeing an unchanged
   app Version Id is not evidence of completion.
3. In the intended shopping conversation, open a local review using exact IDs
   from a read-only product result. A successful metadata Refresh does not prove
   that an already-open conversation replaced its installed widget HTML: verify
   the versioned resource URI and rendered viewer in that conversation. If it
   retains the old catalog or stale widget, reload it; if necessary use a fresh
   conversation as prescribed by OpenAI.
4. Verify the rendered review, images, inline details, local acceptance, Basket
   containing only accepted products, and navigation back to Needs review. Test
   contextual alternatives with a bounded search. Do not prepare or submit to
   Nemlig as part of this UI check.
5. Record deployed SHA, refresh readback, rendered behavior and any failure in
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
