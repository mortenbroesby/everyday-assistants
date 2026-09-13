## ADDED Requirements

### Requirement: Accepted releases retain a bounded image history

After an accepted production deployment, the release operation SHALL retain the current production Container image and the nine most recently accepted distinct prior production image digests. It SHALL also retain every additional digest required by an active Worker deployment, current or rolling Container application, unresolved deployment recovery operation, or explicit unexpired operator hold.

#### Scenario: More than ten accepted images exist

- **WHEN** a production deployment has passed its required acceptance and more than ten distinct accepted image digests exist
- **THEN** the retention plan protects the current image and nine most recent distinct prior accepted images and considers only older unprotected Nemlig production images for deletion

#### Scenario: A protected image exceeds the nominal count

- **WHEN** an active deployment, Container state, recovery operation, or operator hold references an image outside the ten accepted-image window
- **THEN** the image remains protected and the retained count exceeds ten rather than deleting a required image

#### Scenario: Worker history references a retired image

- **WHEN** an old Worker version remains after its image falls outside the protected retention set
- **THEN** the Worker record remains available for audit but the system does not claim that version is a supported rollback target

### Requirement: Image cleanup shares the production release exclusion boundary

Automatic cleanup SHALL run after accepted release evidence is durably recorded and before the existing production lease is released. It SHALL NOT introduce an independently scheduled mutation path unless later evidence proves that accepted-release cleanup cannot control image accumulation.

#### Scenario: Accepted deployment reaches finalization

- **WHEN** the enabled candidate and required acceptance checks are complete and exact evidence has been saved
- **THEN** the operation records the accepted image, computes cleanup under the held production lease, and releases the lease only after cleanup reaches a recorded terminal result

#### Scenario: Deployment is failed, pending, or uncertain

- **WHEN** deployment acceptance, image identity, provider state, recovery state, ledger state, or registry inventory is incomplete or inconsistent
- **THEN** no image is deleted and the operation records why cleanup was blocked

#### Scenario: Cleanup fails after a healthy deployment

- **WHEN** cleanup is blocked, partial, or fails after the release has passed acceptance
- **THEN** the release remains accepted, cleanup does not trigger deployment rollback or change `MCP_ENABLED`, and the result is reported separately

### Requirement: Image deletion is scoped, bounded, and revalidated

Cleanup SHALL act only on the configured Nemlig production image repository, SHALL resolve tags to immutable manifests, SHALL revalidate protected provider references before each mutation, and SHALL delete sequentially with fixed deadlines and at most ten image digests in one run. It SHALL NOT delete the Container application, Worker versions or deployments, Durable Object data, bindings, routes, secrets, or foreign images.

#### Scenario: Candidate remains safe to delete

- **WHEN** a candidate is outside every protected set, has trustworthy provenance, exceeds the grace period, and its tag-to-digest mapping and provider references remain unchanged immediately before deletion
- **THEN** cleanup may delete that candidate and must verify the resulting registry and all protected references afterward

#### Scenario: Provider state changes during cleanup

- **WHEN** the production lease, deployment, Container application, instance state, tag mapping, or protected reference differs from the retention plan
- **THEN** cleanup stops the batch without deleting the changed candidate or any later candidate

#### Scenario: Deletion result is indeterminate

- **WHEN** a deletion times out or its result cannot be read back
- **THEN** cleanup stops and requires a fresh inventory reconciliation before another deletion attempt

#### Scenario: Another registry repository is present

- **WHEN** registry inventory includes images outside the exact Nemlig production repository
- **THEN** cleanup excludes them without attempting to classify or delete them

### Requirement: Cleanup rolls out with reviewable evidence

The repository SHALL provide a read-only retention report before deletion is enabled. Reports SHALL contain only bounded non-secret operational evidence, including protected, candidate and deleted counts, reason categories, distinct manifests, logical bytes, deduplicated compressed-byte estimates, estimated reclaimable bytes, timestamp and ledger version. Registry estimates SHALL be labeled as estimates rather than Cloudflare billing or occupied-storage measurements.

#### Scenario: Initial rollout is evaluated

- **WHEN** the cleanup implementation first runs against production inventory
- **THEN** it emits a dry-run report, performs no deletion, and permits reviewers to reproduce the protected and candidate sets

#### Scenario: Destructive cleanup is enabled

- **WHEN** the owner separately approves the reviewed cleanup behavior and provider mutation after dry-run evidence is accepted
- **THEN** the release path may enable bounded deletion without gaining authority over other Cloudflare or Nemlig state

#### Scenario: Tags share image layers

- **WHEN** storage is estimated from registry manifests
- **THEN** the report distinguishes logical per-tag bytes from unique compressed blobs and does not multiply shared layers by tag count

