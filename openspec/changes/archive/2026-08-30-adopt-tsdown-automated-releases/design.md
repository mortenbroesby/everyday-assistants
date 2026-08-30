## Context

See `proposal.md` for motivation and `specs/nemlig-package-distribution/spec.md` for observable behavior. The repository is a private pnpm/Turborepo monorepo with three independent assistants and one full CI job. Only the completed Nemlig TypeScript package is intended for distribution. The project already pins Node 22.23.1 locally, but package metadata and CI still allow older Node versions that current `tsdown` cannot run on.

Astrograph's release model is the reference: prerelease versions carry a never-decreasing alpha increment; release intent comes from conventional commits plus package-bearing paths; planning is read-only; apply and merged publication compare the candidate with main, tags, and npm; exact tagged candidates can be retried without inventing a new release.

## Goals / Non-Goals

**Goals:**

- Keep one small release policy for one publishable workspace package.
- Make the built tarball, not the source checkout, the final executable proof.
- Fail closed before tag or publication when main, Git tag, or npm state is ambiguous.
- Reuse the existing full CI gate while keeping external publication dormant and adding no scheduled or matrix workflows.

**Non-Goals:**

- A generic multi-package release framework or independent versions for private apps.
- Runtime API exports beyond the three existing binaries.
- Changelog generation, GitHub Releases, release PRs, or automatic merge.
- npm package claiming or publication, trusted-publisher/environment configuration, provenance, package-tag creation, repository visibility changes, or the follow-up ChatGPT tunnel.
- Any live Nemlig login, search, basket mutation, checkout, order, or payment test.

## Decisions

### Build one private package under the local `nemlig-shopper` name

Change only the Nemlig workspace manifest name from `nemlig-food-assistant` to `nemlig-shopper`, update workspace filters, and declare exact distributable files, repository links, and the three existing bins. Keep `private: true`, omit public publish configuration, and start at `0.1.0-alpha.0`. A future activation change may adopt package-scoped tags `nemlig-shopper-v<version>` after the name and external setup are approved.

Alternative: publish the root monorepo or every app. Rejected because independent assistants can have different credential and mutation boundaries.

Alternative: claim the unscoped or a scoped npm name now. Deferred because PR #8 only needs the local CLI/MCP package and no external publication is authorized.

### Use tsdown only for distributable runtime entries

Add an app-local `tsdown.config.ts` with `src/cli.ts` and `src/mcp.ts` entries, ESM output, Node 22 target, clean output, and sourcemaps. Preserve the existing shebang/executable behavior. Keep `tsc --noEmit` as `check`; run source tests through current `tsx` so test files are not bundled or published. Add a tarball smoke that packs the workspace, installs it into a temporary directory, and exercises the installed bins without credentials or network.

Alternative: compile every source and test with `tsc`. Rejected because it is the emitter being replaced and it makes the published `dist` boundary broader than needed.

Alternative: bundle tests into `dist`. Rejected because package consumers do not need repository tests.

### Align the repository toolchain with tsdown's supported floor

Use the existing `.tool-versions` pin, Node 22.23.1, in root engines, the Nemlig manifest, and CI. Add current `tsdown` 0.22.14, `tsx` 4.23.x, and compatible TypeScript 5.9.3/Node 22 types. Keep existing runtime and lint dependencies because registry checks show they are already current. Do not adopt TypeScript 7 while `typescript-eslint` 8.68.0 declares `<6.1.0`.

Alternative: retain Node 22.13.0. Rejected because current tsdown requires Node 22.18 or newer.

Alternative: force every latest major. Rejected because peer-incompatible tooling is not an up-to-date working toolchain.

### Adapt Astrograph's policy around package-scoped paths

Keep release/version modules and tests adjacent to the Nemlig package but outside the published file list. Use `semver` for generic npm comparisons and a strict parser for `major.minor.patch-alpha.increment`. Classify only publishable Nemlig source/manifest/build changes as release-bearing. Nemlig tests and release-policy internals require only an alpha increment; unrelated workspaces and docs/specs/rules/workflows are no-ops. Treat the shared lockfile as release-bearing only when the Nemlig manifest or runtime also changed.

Expose package-filtered `release:plan`, `release:apply`, and `check:version-bump` scripts. Apply may update the Nemlig manifest only after the same fail-closed main/tag/npm checks used by publication; the owning pull request carries that version change into CI.

Alternative: copy Astrograph's repository-wide path regex unchanged. Rejected because a shared lockfile or another app's change would spuriously publish Nemlig.

Alternative: add Changesets or release-please. Rejected because the user selected Astrograph's existing deterministic policy and one package does not need another release state format or bot.

### Retain dormant publication scaffolding behind two fail-closed guards

Keep the current `verify` job as the only active test gate. Retain the release and retry scaffolding, but guard both jobs with `vars.NEMLIG_PUBLISH_ENABLED == 'true'` and keep that variable absent. Keep the package itself marked private, so a mistakenly enabled job still cannot publish. No GitHub `npm` environment, npm package claim, trusted-publisher binding, provenance setup, or repository visibility change belongs to this delivery.

The dormant manual retry accepts an existing tag and never runs version apply or creates a tag. Its validation remains tested locally, but its external publication path is intentionally unverified until a future activation change performs the required security and account review.

Alternative: remove all future release scaffolding. Rejected because the guarded code and local policy tests are already complete and harmless while both activation guards remain in place.

## Risks / Trade-offs

- [A future publisher cannot claim the chosen name or use provenance from the selected repository visibility] → Resolve package naming, repository visibility, and trusted-publisher design in the separate activation change.
- [Bundling changes dynamic import, shebang, or MCP stdio behavior] → Retain focused interface tests and make installed-tarball CLI/MCP smoke a release gate.
- [Shared lockfile changes create false releases] → Require a Nemlig package/runtime change alongside lockfile-only evidence.
- [Conventional commit history contains unrelated feature commits] → Determine release kind only from commits and changed paths since the latest package-scoped tag, with package paths controlling whether any publication exists.
- [Dormant publication is accidentally enabled] → Keep the repository variable absent and the package private; activation requires an explicit future code/config change.
- [Custom policy code drifts from Astrograph] → Port only its tested invariants and keep small table-driven policy/transaction tests; do not create a generalized framework.

## Migration Plan

1. Align Node metadata/CI and migrate the Nemlig build/test/package manifest to tsdown; validate the packed artifact locally.
2. Add the package-scoped version parser, release classifier, transaction checks, CLI scripts, and focused tests.
3. Add PR version policy plus dormant, doubly guarded main/retry scaffolding and document the deferral.
4. Bootstrap `0.1.0-alpha.0`, run focused checks, tarball smoke, root `pnpm verify`, strict OpenSpec validation, and draft-PR CI.
5. Merge with `NEMLIG_PUBLISH_ENABLED` absent, the package private, and no npm/GitHub publication configuration. Confirm exact-head CI and the installed-tarball smoke only.
6. Treat any package claim, trusted-publisher setup, public provenance, tag creation, or npm publication as a separate future change requiring explicit approval.

Rollback this private delivery by reverting the change. Publication rollback policy is deferred with publication itself.
