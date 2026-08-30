## Purpose

Defines how the repository builds, versions, verifies, packs, and locally installs the private Nemlig Shopper package without weakening its local safety contract or enabling external publication.

## ADDED Requirements

### Requirement: Private installable Nemlig Shopper package
The system SHALL produce a private ESM npm-format package named `nemlig-shopper` whose declared files contain the Nemlig runtime and documentation, whose version follows `major.minor.patch-alpha.increment`, and whose `nemlig`, `nemlig-shopper`, and `nemlig-mcp` binaries preserve the specified non-recipe CLI and MCP surfaces. The package SHALL be installable from its generated tarball but SHALL NOT be publishable until a separate explicitly approved change removes the private guard.

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
- **WHEN** npm authoritatively reports that `nemlig-shopper` has no published versions
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
