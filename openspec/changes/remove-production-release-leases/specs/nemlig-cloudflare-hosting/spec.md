## REMOVED Requirements

### Requirement: Automated production releases are exact and review-gated

**Reason**: Release ownership, recovery dispatch, and publication from a durable journal are no longer part of routine production delivery.

**Migration**: Use the exact-main CI-driven routine documented in `nemlig-production-delivery`. Prerelease publication remains independent of deploy eligibility and is not part of this workflow.

### Requirement: Automated releases are serialized and build once

**Reason**: The repository-wide production lease and lease-based predecessor gate were retired in favor of the existing serialized GitHub Actions queue.

**Migration**: Preserve exact-candidate, provider-configuration, capacity, and active-rollout checks. Do not recreate a second release lock or recovery dispatch.

### Requirement: Automated releases are bounded and recoverable

**Reason**: The owner chose a routine build, verify, deploy, and read-only acceptance path without automatic restore or durable recovery state.

**Migration**: On failure or interruption, report the failed release and inspect current provider state before any separately reviewed corrective action. Do not create a lease, journal, recovery artifact, automatic rollback, or recovery workflow.
