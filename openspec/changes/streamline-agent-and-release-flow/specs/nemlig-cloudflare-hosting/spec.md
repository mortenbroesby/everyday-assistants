## MODIFIED Requirements

### Requirement: Automated production releases are exact and review-gated

The repository SHALL provide one production release operation that accepts an
exact `main` commit and requires successful CI for that exact revision before any
Cloudflare mutation. It MAY start from a manual dispatch or SHALL be submitted
after successful CI for a merged pull request whose exact merge range satisfies
the existing package-scoped Nemlig release policy and contains the required
forward package version. An ineligible merge MUST stop before production
credentials or provider access. The protected production environment remains
the final approval.

#### Scenario: Exact release is authorized and ready

- **WHEN** the operator explicitly invokes the release operation with a full
  commit that equals local HEAD and refreshed remote `main` and exact-head CI is
  successful
- **THEN** the operation may proceed to its serialized Cloudflare preflight

#### Scenario: Labeled merge is ready

- **WHEN** a pull request with a version-policy-eligible Nemlig change is merged
  to `main` and CI succeeds for the exact merge commit
- **THEN** the protected routine release is submitted for that exact commit

#### Scenario: Merge is not labeled

- **WHEN** CI succeeds for a merge containing only documentation,
  specifications, agent instructions, workflow changes, another assistant, or
  other paths excluded by the package-scoped release policy
- **THEN** no production job receives credentials and Cloudflare is unchanged

#### Scenario: Source or CI does not match

- **WHEN** the supplied commit, checked-out HEAD, remote `main`, successful CI
  result, merge base, or package version does not identify one coherent release
- **THEN** the operation fails before changing Cloudflare
