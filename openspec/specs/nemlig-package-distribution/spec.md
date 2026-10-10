## Purpose

Defines how the repository builds, versions, verifies, packs, and locally installs the private Nemlig Assistant package without weakening its local safety contract or enabling external publication.

## Requirements

### Requirement: Private installable Nemlig Assistant package
The system SHALL produce a private ESM npm-format package named `nemlig-assistant` whose declared files contain the Nemlig runtime and documentation, whose maintained version follows plain `major.minor.patch` SemVer, and whose `nemlig`, `nemlig-assistant`, `nemlig-mcp`, and `nemlig-mcp-http` commands preserve the specified non-recipe CLI, stdio MCP, and HTTP MCP surfaces. The package SHALL retain its version/codename runtime identity, SHALL be installable from its generated tarball, and SHALL NOT be publishable until a separate explicitly approved change removes the private guard.

#### Scenario: Inspect packed package
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** its manifest, file list, version/codename identity, and four commands backed by three bundled entry points match the declared distribution contract and contain no tests, credentials, local artifacts, or unrelated assistant code

#### Scenario: Run packed interfaces
- **WHEN** the packed artifact is installed in a clean temporary directory on the supported Node runtime
- **THEN** CLI help and the credential-free MCP surface run from the installed package without repository source files or Python

#### Scenario: Inspect installed runtime identity
- **WHEN** a client connects to the installed MCP package
- **THEN** its server version matches the package manifest and its instructions identify the same version and codename

### Requirement: Supported build and runtime toolchain
The repository SHALL build the private installable package with a bundler version compatible with the pinned Node 24.13.0 toolchain, SHALL retain an independent TypeScript type-check, and SHALL use dependency versions that satisfy the declared Node and lint peer ranges.

#### Scenario: Verify current toolchain
- **WHEN** CI installs the frozen lockfile under Node 24.13.0 and runs focused and root verification
- **THEN** build, type-check, lint, tests, smoke, and package-tarball validation pass without compatibility warnings or undeclared runtime dependencies

#### Scenario: Incompatible latest major exists
- **WHEN** a newer library major conflicts with another required tool's peer range
- **THEN** the repository retains the newest compatible release line and records the compatibility reason rather than forcing the incompatible major

### Requirement: Package-scoped version policy
Release-bearing Nemlig candidates SHALL maintain a forward plain SemVer version
according to conventional commit intent, one new valid codename appended to the
immutable version/codename ledger, and one bounded, non-empty, version-addressed
reviewed release note identifying the same pair with an opening plain-language
summary. Retained explicit version and release-note checks SHALL evaluate exact
committed base/head revisions and fail closed on invalid references or metadata.
Historical alpha versions MAY be read as comparison baselines; new candidates
SHALL NOT use an alpha suffix or independent increment counter. Non-release
changes SHALL preserve the version, codename, and ledger and SHALL require no new
release note. Routine CI and deployment eligibility SHALL remain based on trusted
exact-SHA verification and delivery safety evidence, without requiring these
explicit metadata checks, a new version, or publication as deployment gates.

#### Scenario: Runtime feature changes

- **WHEN** explicit release checks evaluate a release-bearing `feat` candidate
- **THEN** they require at least a forward minor plain SemVer bump, a new ledger-bound codename, and the matching reviewed release note

#### Scenario: Runtime fix changes

- **WHEN** explicit release checks evaluate a release-bearing runtime fix without a feature or breaking marker
- **THEN** they require at least a forward patch plain SemVer bump, a new ledger-bound codename, and the matching reviewed release note in the candidate diff

#### Scenario: Breaking runtime changes

- **WHEN** explicit release checks evaluate a release-bearing commit using `!` or `BREAKING CHANGE:`
- **THEN** they require a forward major plain SemVer bump, a new ledger-bound codename, and the matching reviewed release note

#### Scenario: Unrelated assistant changes

- **WHEN** a pull request changes only another app or other non-release-bearing paths
- **THEN** explicit release checks report no required new package version or note and reject unrelated identity or ledger changes

#### Scenario: Ineligible change

- **WHEN** a pull request changes only paths excluded by the package-scoped release policy
- **THEN** neither a Nemlig version change nor new release note is required, and version/codename identity and ledger remain unchanged

#### Scenario: Release note is missing or malformed

- **WHEN** the explicit release-note check evaluates a release-bearing candidate whose expected note is missing, empty, excessive, absent from the exact candidate diff, or identifies another version/codename
- **THEN** that check fails without becoming a routine deployment eligibility gate

#### Scenario: Routine delivery retains runtime identity

- **WHEN** trusted exact-SHA verification admits a candidate for routine protected delivery
- **THEN** delivery preserves the candidate's package identity without allocating a new version/codename or requiring a GitHub release, npm publication, or explicit version/release-note gate

### Requirement: Safe release planning and apply
The system SHALL retain a read-only release plan and an explicit apply operation that derive the release decision from Git history and package-scoped changed files, and SHALL reject malformed, stale, conflicting, or unverifiable candidates before changing package identity. Planning SHALL report the target version/codename, ledger, and tag; apply SHALL update the manifest and codename ledger without creating a tag or publishing a release. These explicit tools SHALL remain separate from routine production deployment.

#### Scenario: Plan a release
- **WHEN** a maintainer runs release planning
- **THEN** the command reports the baseline, decision kind, candidate version/codename and tag, main state, tag state, and npm registry state without modifying files or refs

#### Scenario: Registry package is unpublished
- **WHEN** npm authoritatively reports that `nemlig-assistant` has no published versions
- **THEN** the first otherwise-valid candidate may proceed while network, authorization, malformed-response, and other registry failures remain fail-closed

#### Scenario: Candidate conflicts
- **WHEN** the candidate is older than main, not newer than npm, malformed, or already represented by a conflicting tag
- **THEN** release apply rejects it before changing the package version, codename, or ledger

#### Scenario: Matching tag already exists
- **WHEN** the exact package-scoped tag already identifies the candidate
- **THEN** ordinary release application is an idempotent no-op and does not create another version or tag

### Requirement: External package publication remains disabled
The system SHALL keep the Nemlig package marked private and SHALL NOT publish it
to npm. Routine deployment SHALL NOT create a GitHub application-release tag or
prerelease. Retained manual GitHub publication tooling MAY create one tag and
prerelease only as a separately authorized operation for the exact successfully
deployed commit with matching journal, version/codename, and reviewed note.
Package claiming, npm trusted-publisher configuration, npm provenance, package
visibility changes, and npm publication SHALL require a separate explicitly
approved change.

#### Scenario: Verified application release

- **WHEN** a separately authorized manual publication evaluates a successfully deployed candidate with valid exact journal, version/codename, and reviewed note
- **THEN** the retained tool may publish `nemlig-assistant-v<version>` as a GitHub prerelease targeting that exact deployed commit without publishing to npm or altering runtime identity

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
The private package SHALL contain the deterministic self-contained shared product viewer required by the MCP resource, embedded in its bundled MCP entry point and rendered without repository source files. Its HTML SHALL contain embedded executable code and styling with no unresolved browser import or external executable dependency, and the package SHALL exclude synthetic fixtures and test files. The viewer SHALL keep plain product and actual-basket payloads read-only and support the authenticated conversation's temporary server-owned Draft list through interchangeable supported cards, with protected submission after exact explicit approval through the host tool bridge. It SHALL NOT fetch Nemlig directly or authorize writes merely by rendering and SHALL preserve complete text fallback.

#### Scenario: Inspect packed product viewer
- **WHEN** the package is packed without credentials or Nemlig network access
- **THEN** the bundled MCP entry point contains the complete product viewer renderer and omits uncompiled browser source, fixtures, and test files

#### Scenario: Reproduce the product viewer
- **WHEN** two clean builds run from the same source and locked dependency graph
- **THEN** their viewer renderers produce byte-identical HTML with no external application script, stylesheet, dynamic JavaScript chunk, direct provider fetch, or executable network dependency

#### Scenario: Run product viewer from packed installation
- **WHEN** the credential-free MCP server is launched from a clean tarball installation and a client reads the enabled product viewer resource
- **THEN** the server returns the exact complete built resource without resolving repository paths, bare browser imports, external application styles, dynamic chunks, or executable network dependencies

### Requirement: Supported product viewer build pipeline
The private package SHALL produce the bundled Node entry points and embedded self-contained product viewer through the supported tsdown package build.

#### Scenario: Build the production product viewer
- **WHEN** the package build runs from the locked dependency graph
- **THEN** the Node bundles include the viewer renderer in deterministic build order without a separate browser or Tailwind build, dynamic browser chunks, or a post-build asset mutation
