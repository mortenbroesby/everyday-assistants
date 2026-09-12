## MODIFIED Requirements

### Requirement: Automated production releases are exact and review-gated

The repository SHALL provide one production release operation that accepts an
exact `main` commit and requires successful CI for that exact revision before
any Cloudflare mutation. It MAY start from a manual dispatch or SHALL be
submitted after successful CI for a merged pull request whose exact merge range
satisfies the package-scoped Nemlig release policy, contains the required
forward version, and contains its reviewed agent-authored note. An ineligible
merge MUST stop before production credentials or provider access. The protected
production environment remains the final approval.

After routine deployment succeeds, a separate job SHALL publish the reviewed
note as a GitHub prerelease only when the schema-2 deployment journal identifies
the exact candidate and producing run, records success with the enabled state
and completion time, includes edge and service-fixture acceptance, and excludes
pending live acceptance. The journal commit, not the historical cutover
`acceptedRevision`, is the deployed revision.

#### Scenario: Exact release is authorized and ready

- **WHEN** the operator explicitly invokes the release operation with a full
  commit that equals local HEAD and refreshed remote `main` and exact-head CI is
  successful
- **THEN** the operation may proceed to its serialized Cloudflare preflight

#### Scenario: Labeled merge is ready

- **WHEN** a pull request with a version-policy-eligible Nemlig change and its
  reviewed note is merged to `main` and CI succeeds for the exact merge commit
- **THEN** the protected routine release is submitted for that exact commit

#### Scenario: Merge is not labeled

- **WHEN** CI succeeds for a merge containing only documentation,
  specifications, agent instructions, workflow changes, another assistant, or
  other paths excluded by the package-scoped release policy
- **THEN** no production job receives credentials and Cloudflare is unchanged

#### Scenario: Source or CI does not match

- **WHEN** the supplied commit, checked-out HEAD, remote `main`, successful CI
  result, merge base, package version, or release note does not identify one
  coherent release
- **THEN** the operation fails before changing Cloudflare

#### Scenario: Exact routine deployment is published

- **WHEN** the protected routine release succeeds for the exact candidate and
  its deployment journal contains every required terminal acceptance check
- **THEN** the downstream job publishes or confirms an idempotent prerelease
  whose tag resolves to that candidate and whose body matches its committed note

#### Scenario: Deployment evidence is not publishable

- **WHEN** the journal is failed, rolled back, incomplete, live-acceptance
  pending, for another commit or run, or missing a routine acceptance check
- **THEN** publication fails before creating or changing a tag or release

#### Scenario: Publication is retried

- **WHEN** deployment succeeded but GitHub publication was interrupted
- **THEN** the publication job reconciles retained exact-run evidence and
  matching remote state without redeploying, retargeting, or overwriting a
  conflict

#### Scenario: Manual finalize or supervised cutover runs

- **WHEN** the workflow only finalizes recovery or records pending supervised
  live acceptance
- **THEN** it does not publish a fresh application release
