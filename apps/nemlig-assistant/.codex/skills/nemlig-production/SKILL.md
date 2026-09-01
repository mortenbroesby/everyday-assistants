---
name: nemlig-production
description: Verify Nemlig Assistant production readiness without deploying, changing providers, or mutating a basket.
---

# Nemlig production readiness

Run from the Everyday Assistants repository root.

## Preflight

1. Read the root and Nemlig `AGENTS.md` files.
2. Confirm the worktree is clean or preserve unrelated changes.
3. Read `docs/nemlig-production-readiness.md` and
   `docs/cloudflare-operations.md`.

## Automated evidence

Run the credential-free repository gate:

```sh
pnpm nemlig:production:ready
```

The gate validates specifications, privacy, source and tests, the packed package,
and a Cloudflare production dry run. Passing it does not authorize deployment,
provider configuration, publication, secret changes, or Nemlig operations.

## Optional live evidence

Run live checks only when the owner explicitly requests them. Use the exact
commands and boundaries in `docs/cloudflare-operations.md`:

- The edge probe contacts production but requires no owner token.
- The feature check requires a current owner token and performs reads and
  proposal preparation without apply calls.
- Any basket mutation requires separate exact mutation and restoration approval.
  Read and follow the `nemlig-basket` skill before presenting or applying either
  envelope.

Never infer Cloudflare, Auth0, DNS, GitHub, npm, secret, or basket mutation
authority from repository work or a passing readiness gate.

## Handoff

Report the branch, commit, remote-ref match, CI result, automated gate result,
and any live evidence that was explicitly run. Clearly label unrun owner actions
as pending; never claim deployment or basket verification without readback.
