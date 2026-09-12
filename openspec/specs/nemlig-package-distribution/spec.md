## Purpose

Defines how the repository builds, versions, verifies, packs, and locally installs the private Nemlig Assistant package without weakening its local safety contract or enabling external publication.

## Requirements

### Requirement: Private installable Nemlig Assistant package
The system SHALL produce a private ESM npm-format package named `nemlig-assistant` whose declared files contain the Nemlig runtime and documentation, whose version follows `major.minor.patch-alpha.increment`, and whose `nemlig`, `nemlig-assistant`, and `nemlig-mcp` binaries preserve the specified non-recipe CLI and MCP surfaces. The package SHALL be installable from its generated tarball but SHALL NOT be publishable until a separate explicitly approved change removes the private guard.

#### Scenario: Inspect packed package
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** its manifest, file list, version, and three executable entry points match the declared distribution contract and contain no tests, credentials, local artifacts, or unrelated assistant code

#### Scenario: Run packed interfaces
- **WHEN** the packed artifact is installed in a clean temporary directory on the supported Node runtime
- **THEN** CLI help and the credential-free MCP surface run from the installed package without repository source files or Python

### Requirement: Supported build and runtime toolchain
The repository SHALL build the publishable package with a bundler version compatible with the pinned Node 22.23.1 toolchain, SHALL retain an independent TypeScript type-check, and SHALL use dependency versions that satisfy the declared Node and lint peer ranges.

#### Scenario: Verify current toolchain
- **WHEN** CI installs the frozen lockfile under Node 22.23.1 and runs focused and root verification
- **THEN** build, type-check, lint, tests, smoke, and package-tarball validation pass without compatibility warnings or undeclared runtime dependencies

#### Scenario: Incompatible latest major exists
- **WHEN** a newer library major conflicts with another required tool's peer range
- **THEN** the repository retains the newest compatible release line and records the compatibility reason rather than forcing the incompatible major

### Requirement: Package-scoped version policy
The system SHALL require every pull request with Nemlig release-bearing changes to advance the Nemlig package version according to conventional commit intent, SHALL preserve a monotonically increasing alpha increment across semantic-version bumps, and SHALL NOT require a Nemlig version change for unrelated workspaces or documentation, specification, agent-rule, and workflow-only changes.

#### Scenario: Runtime feature changes
- **WHEN** a pull request contains a `feat` commit and changes the publishable Nemlig runtime
- **THEN** the version gate requires a forward minor prerelease version with an alpha increment greater than its baseline

#### Scenario: Runtime fix changes
- **WHEN** a pull request changes the publishable Nemlig runtime without a feature or breaking marker
- **THEN** the version gate requires a forward patch prerelease version with an alpha increment greater than its baseline

#### Scenario: Breaking runtime changes
- **WHEN** a release-bearing commit uses `!` or `BREAKING CHANGE:`
- **THEN** the version gate requires a forward major prerelease version with an alpha increment greater than its baseline

#### Scenario: Unrelated assistant changes
- **WHEN** a pull request changes only another app or other non-release-bearing paths
- **THEN** the Nemlig version gate reports no required package version change

### Requirement: Safe release planning and apply
The system SHALL provide a read-only release plan and an explicit apply operation that derive the release decision from Git history and package-scoped changed files, and SHALL reject malformed, stale, duplicate, conflicting, or unverifiable candidates before changing a version or creating a tag.

#### Scenario: Plan a release
- **WHEN** a maintainer runs release planning
- **THEN** the command reports the baseline, decision kind, candidate version and tag, main state, tag state, and npm registry state without modifying files or refs

#### Scenario: Registry package is unpublished
- **WHEN** npm authoritatively reports that `nemlig-assistant` has no published versions
- **THEN** the first otherwise-valid candidate may proceed while network, authorization, malformed-response, and other registry failures remain fail-closed

#### Scenario: Candidate conflicts
- **WHEN** the candidate is older than main, not newer than npm, malformed, or already represented by a conflicting tag
- **THEN** release apply rejects it before version, tag, or publication mutation

#### Scenario: Matching tag already exists
- **WHEN** the exact package-scoped tag already identifies the candidate
- **THEN** ordinary release application is an idempotent no-op and does not create another version or tag

### Requirement: External publication remains disabled
The system SHALL keep all tag creation and npm publication behavior disabled for the private-first delivery. Publication jobs SHALL run only when `NEMLIG_PUBLISH_ENABLED` is exactly `true`, and the package SHALL remain marked private. Package claiming, trusted-publisher configuration, provenance, GitHub deployment-environment setup, and repository visibility SHALL require a separate explicitly approved change.

#### Scenario: Merge while publication is deferred
- **WHEN** full CI succeeds for a push to `main` while `NEMLIG_PUBLISH_ENABLED` is absent or false
- **THEN** the publication job is skipped and creates no package tag or npm publication

#### Scenario: Manual retry while publication is deferred
- **WHEN** the CI workflow is manually dispatched while `NEMLIG_PUBLISH_ENABLED` is absent or false
- **THEN** the retry job is skipped before checkout, tag validation, or npm access

#### Scenario: Publication variable is enabled prematurely
- **WHEN** `NEMLIG_PUBLISH_ENABLED` is set before the deferred activation change removes the package's private guard and verifies every external prerequisite
- **THEN** npm publication fails closed rather than publishing the private package

### Requirement: Deterministic production-readiness gate

The repository SHALL provide one CI-enforced production-readiness gate that validates strict OpenSpec contracts, public-tree privacy, root quality checks, the installed private package interfaces, and the Cloudflare production deployment artifact. The gate MUST run without Nemlig credentials, provider secrets, live Nemlig access, provider mutation, or basket mutation and MUST fail when any constituent check fails.

#### Scenario: Pull request is production-ready

- **WHEN** CI evaluates a pull request whose specifications, source, tests, packed interfaces, and Cloudflare production artifact are valid
- **THEN** the production-readiness gate succeeds and records each required constituent check as passed

#### Scenario: A production artifact drifts

- **WHEN** any required specification, privacy, source, test, packed-package, or Cloudflare dry-run check fails
- **THEN** the production-readiness gate fails and identifies the failing constituent command without continuing to a production deployment

#### Scenario: Repository readiness is checked without production authority

- **WHEN** a maintainer or coding agent runs the production-readiness gate
- **THEN** the gate performs no Cloudflare, Auth0, DNS, GitHub, npm, or Nemlig mutation and grants no authority for deployment, publication, or basket changes

### Requirement: Packaged picker artifact
The private package SHALL contain the deterministic self-contained picker artifact required by the MCP resource, SHALL load it without repository source files, SHALL contain embedded executable code and application styling with no unresolved browser import or executable dependency, and SHALL exclude the local design showcase and its synthetic fixtures.

#### Scenario: Inspect packed picker
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** the declared package files contain the built picker artifact and omit its uncompiled browser source, showcase output and fixtures, and test files

#### Scenario: Reproduce the picker
- **WHEN** two clean builds run from the same locked dependency graph
- **THEN** they produce byte-identical picker HTML with no external application script, stylesheet, dynamic JavaScript chunk, or API reference and no font origin outside the exact approved OpenAI resource origin

#### Scenario: Run picker from packed installation
- **WHEN** the credential-free MCP server is launched from a clean tarball installation and a client reads the enabled picker resource
- **THEN** the server returns the exact complete built resource without resolving repository paths, bare browser imports, external application styles, dynamic chunks, or executable network dependencies

### Requirement: Supported browser build pipeline
The private package SHALL produce the picker with a standard pinned browser build that processes React, Tailwind, Apps SDK UI CSS, and the HTML entry without custom rewriting of emitted CSS or hand-built HTML interpolation, while tsdown remains responsible for Node entry points.

#### Scenario: Build the production picker
- **WHEN** the package build runs from the locked dependency graph
- **THEN** the Node and browser builds emit the package artifacts in deterministic order without an experimental tsdown CSS stage, a separate Tailwind CLI stage, or a post-build asset mutation
