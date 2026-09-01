## ADDED Requirements

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
