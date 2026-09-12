## ADDED Requirements

### Requirement: Release versions have one immutable codename

Each release-bearing Nemlig candidate SHALL pair its package version with
exactly one non-empty codename. Release planning SHALL report the next version
and codename without mutation, release apply SHALL record both atomically, and
candidate validation SHALL reject missing, malformed, stale, reused, unchanged,
or mismatched pairs before deployment. A maintainer SHALL choose a short,
single-word codename that reflects the release's main theme. A checked-in ledger
SHALL bind every codenamed version to its codename, and planning and apply SHALL
reject any codename already bound to another version rather than generate or
numerically recycle names. New
package versions SHALL use strict `major.minor.patch` SemVer with no prerelease
suffix or independent increment counter. Changes that are not release-bearing
SHALL change neither the version nor the codename.

Each new codenamed release note SHALL begin with an `In plain language` section
that describes the user-visible outcome for a non-technical reader. Release
guidance SHALL link to one shared glossary that maps release acronyms and
difficult terms to plain-language aliases and concise explanations.

#### Scenario: Plan and apply a release identity

- **WHEN** a maintainer plans and then applies an eligible release-bearing change
- **THEN** planning reports one next version/codename pair without mutation and apply records that same pair in the package and codename ledger for its bounded release note

#### Scenario: Non-release change is evaluated

- **WHEN** a candidate changes only paths excluded by the package-scoped release policy
- **THEN** the release decision remains inapplicable and allocates neither a version nor a codename

#### Scenario: Historical alpha version advances

- **WHEN** the first codenamed release follows a historical `major.minor.patch-alpha.increment` version
- **THEN** its release kind selects the next plain `major.minor.patch` version and records the reviewed codename separately

#### Scenario: Candidate identity is invalid

- **WHEN** an eligible candidate omits its codename, reuses a ledger codename, or its manifest, ledger, and release note do not identify one coherent version/codename pair
- **THEN** validation fails before deployment, tagging, or publication

#### Scenario: Existing candidate is retried

- **WHEN** publication of an already deployed candidate is retried
- **THEN** the retry reuses the candidate's recorded version and codename without advancing either value

#### Scenario: A non-technical reader opens a release

- **WHEN** a reader opens a codenamed release note without prior knowledge of the codebase
- **THEN** the first content section explains the release in plain language and the release guidance provides one glossary lookup for unfamiliar aliases, acronyms, and terms
