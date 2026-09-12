## Why

Nemlig releases have precise semantic versions and immutable deployment evidence,
but no memorable human-facing identity. A codename paired with each successfully
deployed version will let the owner ask ChatGPT which release is live and receive
one concise, recognizable answer without weakening the existing release gate.

## What Changes

- Give every release-bearing Nemlig candidate exactly one reviewed, single-word
  codename chosen to reflect the main theme of that release, and record it in a
  checked-in ledger that rejects reuse across releases.
- Replace the historical `major.minor.patch-alpha.increment` package version
  with plain `major.minor.patch`; keep the codename in separate release metadata.
  Non-release changes advance neither field.
- Treat the version and codename as one immutable release identity across the
  package manifest, codename ledger, release note, deployed MCP
  metadata/instructions, deployment evidence, and GitHub prerelease.
- Make the deployed MCP instructions state the exact version and codename so
  ChatGPT can answer a direct release-identification question without adding a
  new tool.
- Validate that non-release merges allocate no codename, failed deployments
  publish no codename, and retries reuse rather than advance the same candidate
  identity.
- Preserve package-scoped release eligibility: documentation, specifications,
  tests, agent rules, and workflow-only changes do not bump, allocate a
  codename, or deploy the Nemlig package.
- Preserve the invariant that GitHub release publication occurs only after the
  exact candidate has deployed successfully and passed terminal acceptance.

### Non-goals

- Assigning codenames to every pull request, merge, commit, CI run, manual
  cutover, or recovery/finalization operation.
- Releasing or deploying documentation-only and other non-release-bearing work.
- Adding a release-info MCP tool, changing the installed app name, publishing to
  npm, or weakening any deployment approval, rollback, or safety control.
- Retrospectively renaming existing releases.
- Encoding the codename into the SemVer package version.

### Acceptance criteria

- The release planner reports the next version and maintainer-supplied codename
  together without modifying files, while apply records them atomically in the
  candidate.
- New release versions use strict `major.minor.patch`; the obsolete `-alpha.N`
  suffix and internal-only increment disappear.
- Release validation rejects a missing, malformed, stale, reused, unchanged, or
  mismatched codename before deployment or publication.
- A deployed MCP initialization identifies itself to ChatGPT with the exact
  package version and codename while retaining the title `Nemlig Assistant`.
- A successful exact-head deployment publishes one GitHub prerelease whose tag
  remains `nemlig-assistant-v<version>` and whose human-facing title and note
  contain the same codename.
- Failed deployment and non-release merges publish no new codename; an
  idempotent publication retry retains the original version and codename.
- Release-kind semantics, release-note bounds, exact-main verification,
  production approval, single-Container ceiling, and no-npm-publication policy
  remain unchanged.

### Epic boundary

Implement `add-release-codenames` on branch `codex/add-release-codenames` as one
pull request with one version decision and at most one production deployment.
The proposal authorizes planning and repository implementation only; merge,
deployment, GitHub publication, and any provider action remain governed by the
existing protected release workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-package-distribution`: bind one validated codename to each
  release-bearing version and expose the pair through deployed MCP initialization
  and release artifacts.
- `nemlig-cloudflare-hosting`: carry the immutable version/codename identity
  through exact deployment evidence and publish it only after successful
  deployment acceptance.
- `nemlig-mcp`: make the current deployed release identity available to ChatGPT
  without expanding the tool surface or changing the app name.

## Impact

The implementation is expected to touch the Nemlig package manifest and runtime
metadata, release planning/validation/publication scripts and tests, bounded
release-note format, MCP presentation tests, production workflow evidence, and
the relevant release/operations documentation. It adds no runtime service,
network request, storage, secret, provider dependency, polling, or material
operating cost.
