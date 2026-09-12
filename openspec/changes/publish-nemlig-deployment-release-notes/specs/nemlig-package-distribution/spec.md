## MODIFIED Requirements

### Requirement: Package-scoped version policy

The system SHALL require every pull request with Nemlig release-bearing changes
to advance the Nemlig package version according to conventional commit intent,
preserve a monotonically increasing alpha increment across semantic-version
bumps, and include one bounded, non-empty, version-addressed agent-authored
release note in the exact candidate diff. The system SHALL NOT require a Nemlig
version or release note for unrelated workspaces or documentation,
specification, agent-rule, test, release-tooling, and workflow-only changes.

#### Scenario: Runtime fix changes

- **WHEN** a pull request changes the publishable Nemlig runtime without a
  feature or breaking marker
- **THEN** the version gate requires a forward patch prerelease version and its
  reviewed agent-authored release note in the candidate diff

#### Scenario: Runtime feature changes

- **WHEN** a pull request contains a `feat` commit and changes the publishable
  Nemlig runtime
- **THEN** the version gate requires a forward minor prerelease version with an
  alpha increment greater than its baseline and its reviewed release note

#### Scenario: Breaking runtime changes

- **WHEN** a release-bearing commit uses `!` or `BREAKING CHANGE:`
- **THEN** the version gate requires a forward major prerelease version with an
  alpha increment greater than its baseline and its reviewed release note

#### Scenario: Unrelated assistant changes

- **WHEN** a pull request changes only another app or other non-release-bearing
  paths
- **THEN** the Nemlig version gate reports no required package version or note

#### Scenario: Ineligible change

- **WHEN** a pull request changes only paths excluded by the package-scoped
  release policy
- **THEN** neither a Nemlig version change nor release note is required

#### Scenario: Release note is missing or malformed

- **WHEN** a release-bearing candidate lacks the expected version-addressed
  note or its Markdown content is empty, excessive, or identifies another
  version
- **THEN** the exact-range gate fails before deployment

### Requirement: External package publication remains disabled

The system SHALL keep the Nemlig package marked private and SHALL NOT publish it
to npm. After a successful verified production deployment, the system MAY create
one GitHub application-release tag and prerelease for the exact deployed commit.
Package claiming, npm trusted-publisher configuration, npm provenance, package
visibility changes, and npm publication SHALL require a separate explicitly
approved change.

#### Scenario: Verified application release

- **WHEN** a versioned Nemlig candidate has successfully completed protected
  production deployment and its exact journal and reviewed note are valid
- **THEN** the repository may publish `nemlig-assistant-v<version>` as a GitHub
  prerelease targeting that exact deployed commit without publishing to npm

#### Scenario: Package publication remains private

- **WHEN** a GitHub application prerelease is created or retried
- **THEN** the package remains `private: true` and no npm tag, package, registry
  credential, or trusted-publisher operation is created
