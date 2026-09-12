## ADDED Requirements

### Requirement: Codenamed releases are published only after deployment

The production workflow SHALL treat a codename as candidate metadata until the
exact versioned commit has deployed successfully and passed its required
terminal acceptance. Only then SHALL GitHub publication expose the codename as
part of the application release identity. The version tag SHALL retain the
stable `nemlig-assistant-v<version>` format, while the human-facing prerelease
title and reviewed note SHALL identify the same codename.

#### Scenario: Exact routine deployment succeeds

- **WHEN** an eligible version/codename candidate is the exact main commit and its protected production deployment and terminal acceptance succeed
- **THEN** the downstream publication creates or confirms one prerelease for that exact commit whose tag identifies the version and whose title and note identify the same codename

#### Scenario: Deployment does not succeed

- **WHEN** deployment or required terminal acceptance fails or remains incomplete
- **THEN** no GitHub release publishes the candidate codename

#### Scenario: Non-release merge completes CI

- **WHEN** exact-main CI succeeds for documentation, specifications, tests, release tooling, workflow changes, another assistant, or other paths excluded by the package-scoped policy
- **THEN** the production workflow allocates and publishes no codename and performs no routine deployment

#### Scenario: Recovery operation runs

- **WHEN** an operator invokes an approved cutover, rollback, recovery, or finalization operation that is not a new eligible package release
- **THEN** the operation does not allocate a new codename or publish a fresh application release

#### Scenario: Publication is retried

- **WHEN** the exact candidate deployed successfully but its GitHub publication was interrupted
- **THEN** the retry verifies and reuses the recorded version/codename identity without redeploying, retargeting, or overwriting a conflicting release
