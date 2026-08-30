## Why

The Nemlig Shopper implementation is feature-complete but still uses `tsc` as a file emitter and has manual version bookkeeping. Adopting the proven Astrograph build and version model will produce a small installable npm-format package and deterministic release decisions while keeping external publication explicitly disabled for the private-first delivery.

## What Changes

- Switch only `apps/nemlig-assistant` from `tsc` emission to the current compatible `tsdown` release while retaining `tsc --noEmit` for type checking.
- Raise the repository Node 22 floor to the existing project pin, Node 22.23.1, because current `tsdown` requires Node 22.18 or newer.
- Package the Nemlig app under the local name `nemlig-shopper` with its three existing binaries and no recipe, checkout, order, or payment capability; keep the package private and installable from its generated tarball.
- Adapt Astrograph's `major.minor.patch-alpha.increment` policy, conventional-commit release classification, dry-run/apply commands, stale-version rejection, scoped-tag checks, and npm-registry conflict checks to this monorepo.
- Scope release decisions to Nemlig package/runtime files; other apps, docs-only, OpenSpec-only, and workflow-only changes do not require a Nemlig version bump.
- Keep the guarded main/retry publication scaffolding dormant behind `NEMLIG_PUBLISH_ENABLED`, with the variable absent and the package itself marked private. Activation, package claiming, trusted publishing, provenance, and repository visibility are deferred to a separate explicitly approved change.
- Keep current compatible dependency majors: latest `tsdown`, TypeScript 5.9, Node 22 types, and the already-current Nemlig runtime/lint libraries. Do not force TypeScript 7 while `typescript-eslint` excludes it.

### Goal

Deliver a reproducible, locally installable Nemlig Shopper npm-format package whose version is derived safely from verified repository history, without enabling external publication.

### Non-goals

- Publishing or versioning other assistants.
- Claiming or publishing `nemlig-shopper`, configuring npm trusted publishing or a GitHub npm environment, enabling `NEMLIG_PUBLISH_ENABLED`, creating package tags, or changing repository visibility.
- Adding a generic monorepo release framework, release dashboard, release PR bot, changelog generator, or scheduled workflow.
- Changing Nemlig CLI/MCP behavior, basket authorization, credential handling, or upstream feature scope.
- Implementing the follow-up private ChatGPT tunnel integration.

### Acceptance Criteria

- `tsdown` builds the two runtime entry points needed by the three existing binaries, and the packed package runs CLI help and exposes the credential-free MCP surface.
- The private package declares only distributable files and reports the intended `nemlig-shopper` name and prerelease version.
- Pull requests fail when Nemlig release-bearing changes lack a valid forward version; unrelated workspace changes do not require a Nemlig version bump.
- Release planning is read-only, and release apply rejects stale main, existing conflicting tags, unavailable or newer npm state, and unverified candidates.
- Pushes and manual dispatches create no package tag or npm publication while `NEMLIG_PUBLISH_ENABLED` is absent or false; the private package adds a second fail-closed publication guard.
- Root `pnpm verify`, focused package tests, package-tarball smoke, release-policy tests, and strict OpenSpec validation pass without credentials, networked Nemlig access, or basket mutation.

## Capabilities

### New Capabilities

- `nemlig-package-distribution`: Build, version, pack, and locally install the private Nemlig Shopper npm-format package while external publication remains disabled.

### Modified Capabilities

None.

## Impact

- Affects the root Node/CI/release scripts, `.github/workflows/ci.yml`, `pnpm-lock.yaml`, and the Nemlig package metadata, build configuration, tests, and documentation.
- Adds current compatible build/test/release dependencies such as `tsdown`, `tsx`, and `semver`; retains the existing current runtime dependencies.
- Retains dormant, guarded publication scaffolding for a future explicitly approved change; this delivery creates no npm package, trusted-publisher binding, GitHub environment, repository variable, or package tag.
- Leaves other assistants, local credentials, Nemlig account state, and basket contents untouched.
