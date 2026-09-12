## ADDED Requirements

### Requirement: Release versions have one immutable codename

Each release-bearing Nemlig candidate SHALL pair its package version with
exactly one non-empty codename. Release planning SHALL report the next version
and codename without mutation, release apply SHALL record both atomically, and
candidate validation SHALL reject missing, malformed, stale, skipped, or
mismatched pairs before deployment. The ordered sequence SHALL begin `Alpha`,
`Bravo`, `Charlie`, continue through the NATO-style alphabet, and add a cycle
suffix after `Zulu` so the sequence remains deterministic and unbounded. New
package versions SHALL use strict `major.minor.patch` SemVer with no prerelease
suffix or independent increment counter. Changes that are not release-bearing
SHALL change neither the version nor the codename.

#### Scenario: Plan and apply a release identity

- **WHEN** a maintainer plans and then applies an eligible release-bearing change
- **THEN** planning reports one next version/codename pair without mutation and apply records that same pair in the package and its bounded release note

#### Scenario: Non-release change is evaluated

- **WHEN** a candidate changes only paths excluded by the package-scoped release policy
- **THEN** the release decision remains inapplicable and allocates neither a version nor a codename

#### Scenario: Historical alpha version advances

- **WHEN** the first codenamed release follows a historical `major.minor.patch-alpha.increment` version
- **THEN** its release kind selects the next plain `major.minor.patch` version and records `Alpha` separately

#### Scenario: Candidate identity is invalid

- **WHEN** an eligible candidate omits its codename or its manifest, release note, and expected sequence do not identify one coherent version/codename pair
- **THEN** validation fails before deployment, tagging, or publication

#### Scenario: Existing candidate is retried

- **WHEN** publication of an already deployed candidate is retried
- **THEN** the retry reuses the candidate's recorded version and codename without advancing either value
