## Why

Successful Nemlig deployments currently have durable operational evidence but no
readable release history. Commit messages alone are too granular for an epic,
and generating prose inside deployment CI would add a mutable network dependency
at the most sensitive point in delivery.

## What Changes

- Make one committed, version-addressed Markdown note the reviewed source for
  each release-bearing Nemlig epic. The coding agent authors it and copies its
  summary into the pull request; no separate human-written highlights are
  required.
- Validate that note through the existing package-scoped version policy and the
  exact pull-request base/candidate range. Documentation, workflow, test, and
  release-tooling-only changes remain ineligible.
- After the protected production deployment succeeds, validate its immutable
  deployment journal and publish a GitHub prerelease whose tag targets the exact
  deployed SHA and whose body uses the committed note.
- Keep publication idempotent and fail closed on conflicting tags, releases,
  notes, versions, workflow identities, or deployment evidence. A publication
  retry must not require another healthy production deployment.
- Permit the deployment release tag while keeping the npm package private and
  npm publication disabled.
- Prove the path with one behavior-preserving cleanup of product relevance
  matching, protected by direct characterization tests.
- Non-goals: npm publication, generated GitHub notes, a live LLM in CI, removal
  of production approval, Cloudflare capacity changes, or Nemlig account and
  basket mutation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-package-distribution`: Require an immutable agent-authored release note
  for release-bearing changes and permit exact deployment-release tags without
  enabling npm publication.
- `nemlig-cloudflare-hosting`: Publish that note only after exact-SHA production
  deployment evidence has passed all routine acceptance checks.

## Impact

- Release policy and tooling under `apps/nemlig-assistant/release/`.
- Nemlig production workflow and focused workflow contract tests.
- One small `relevantProduct` refactor and its characterization coverage.
- Agent and operator guidance for authoring, reviewing, retrying, and verifying
  releases.
- Cost remains a bounded GitHub Actions job and a few GitHub API calls. No new
  service, dependency, secret, provider capacity, or scheduled work is added.
