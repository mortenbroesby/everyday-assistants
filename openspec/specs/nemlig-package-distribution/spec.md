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
The system SHALL require every pull request with Nemlig release-bearing changes
to advance the Nemlig package version according to conventional commit intent,
preserve a monotonically increasing alpha increment across semantic-version
bumps, and include one bounded, non-empty, version-addressed agent-authored
release note in the exact candidate diff. The system SHALL NOT require a Nemlig
version or release note for unrelated workspaces or documentation,
specification, agent-rule, test, release-tooling, and workflow-only changes.

#### Scenario: Runtime feature changes

- **WHEN** a pull request contains a `feat` commit and changes the publishable Nemlig runtime
- **THEN** the version gate requires a forward minor prerelease version with an alpha increment greater than its baseline and its reviewed release note

#### Scenario: Runtime fix changes

- **WHEN** a pull request changes the publishable Nemlig runtime without a feature or breaking marker
- **THEN** the version gate requires a forward patch prerelease version and its reviewed agent-authored release note in the candidate diff

#### Scenario: Breaking runtime changes

- **WHEN** a release-bearing commit uses `!` or `BREAKING CHANGE:`
- **THEN** the version gate requires a forward major prerelease version with an alpha increment greater than its baseline and its reviewed release note

#### Scenario: Unrelated assistant changes

- **WHEN** a pull request changes only another app or other non-release-bearing paths
- **THEN** the Nemlig version gate reports no required package version or note

#### Scenario: Ineligible change

- **WHEN** a pull request changes only paths excluded by the package-scoped release policy
- **THEN** neither a Nemlig version change nor release note is required

#### Scenario: Release note is missing or malformed

- **WHEN** a release-bearing candidate lacks the expected version-addressed note or its Markdown content is empty, excessive, or identifies another version
- **THEN** the exact-range gate fails before deployment

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

### Requirement: External package publication remains disabled
The system SHALL keep the Nemlig package marked private and SHALL NOT publish it
to npm. After a successful verified production deployment, the system MAY create
one GitHub application-release tag and prerelease for the exact deployed commit.
Package claiming, npm trusted-publisher configuration, npm provenance, package
visibility changes, and npm publication SHALL require a separate explicitly
approved change.

#### Scenario: Verified application release

- **WHEN** a versioned Nemlig candidate has successfully completed protected production deployment and its exact journal and reviewed note are valid
- **THEN** the repository may publish `nemlig-assistant-v<version>` as a GitHub prerelease targeting that exact deployed commit without publishing to npm

#### Scenario: Package publication remains private

- **WHEN** a GitHub application prerelease is created or retried
- **THEN** the package remains `private: true` and no npm tag, package, registry credential, or trusted-publisher operation is created

### Requirement: Deterministic production-readiness gate

The repository SHALL provide one CI-enforced production-readiness gate that validates strict OpenSpec contracts, public-tree privacy, root quality checks, a representative individual-discovery and proposed-basket conversational smoke scenario, installed private package interfaces, and the Cloudflare production deployment artifact. The gate MUST run without Nemlig credentials, provider secrets, live Nemlig access, provider mutation, or basket mutation and MUST fail when any constituent check fails.

#### Scenario: Pull request is production-ready

- **WHEN** CI evaluates a pull request whose specifications, source, tests, recipe-scale smoke behavior, packed interfaces, and Cloudflare production artifact are valid
- **THEN** the production-readiness gate succeeds and records each required constituent check as passed

#### Scenario: A production artifact drifts

- **WHEN** any required specification, privacy, source, test, recipe-scale smoke, packed-package, or Cloudflare dry-run check fails
- **THEN** the production-readiness gate fails and identifies the failing constituent command without continuing to a production deployment

#### Scenario: Repository readiness is checked without production authority

- **WHEN** a maintainer or coding agent runs the production-readiness gate
- **THEN** the gate performs no Cloudflare, Auth0, DNS, GitHub, npm, or Nemlig mutation and grants no authority for deployment, publication, or basket changes

### Requirement: Packaged product viewer artifact
The private package SHALL contain the deterministic self-contained display-only product viewer artifact required by the MCP resource, SHALL load it without repository source files, SHALL contain embedded executable code and styling with no unresolved browser import or executable dependency, and SHALL exclude synthetic fixtures and test files.

#### Scenario: Inspect packed product viewer
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** the declared package files contain the product viewer artifact and omit uncompiled browser source, fixtures, and test files

#### Scenario: Reproduce the product viewer
- **WHEN** two clean builds run from the same locked dependency graph
- **THEN** they produce byte-identical viewer HTML with no external application script, stylesheet, dynamic JavaScript chunk, API reference, or network dependency

#### Scenario: Run product viewer from packed installation
- **WHEN** the credential-free MCP server is launched from a clean tarball installation and a client reads the enabled product viewer resource
- **THEN** the server returns the exact complete built resource without resolving repository paths, bare browser imports, external application styles, dynamic chunks, or executable network dependencies

### Requirement: Supported product viewer build pipeline
The private package SHALL produce the self-contained product viewer through the supported package build, while tsdown remains responsible for Node entry points.

#### Scenario: Build the production product viewer
- **WHEN** the package build runs from the locked dependency graph
- **THEN** the Node and browser builds emit the package artifacts in deterministic order without an experimental tsdown CSS stage, a separate Tailwind CLI stage, or a post-build asset mutation
