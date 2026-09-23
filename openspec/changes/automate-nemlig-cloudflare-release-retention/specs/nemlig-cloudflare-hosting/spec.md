## ADDED Requirements

### Requirement: Production Worker variables have one explicit source of truth

Routine deploys SHALL apply only validated variables declared by the production configuration and the bounded set of values explicitly carried forward by the release contract. They SHALL preserve configured secrets and reject undeclared variables rather than silently inherit stale dashboard state.

#### Scenario: A required credential-key version is configured

- **WHEN** production uses credential encryption
- **THEN** the version binding is explicitly validated, included in effective configuration identity, and deployed with the matching key configuration

#### Scenario: An undeclared dashboard variable exists

- **WHEN** production contains a plain variable not declared by the current release contract
- **THEN** the deploy removes/replaces it through the normal exact-candidate deployment and verifies its absence, without deleting encrypted secrets

### Requirement: Accepted production releases retain a bounded Container image history

After exact deployment acceptance and durable evidence recording, the initial approved reset SHALL remove pre-reset images from the exact Nemlig production image repository except images required by active, rolling, unresolved-recovery, or uncertain state. This intentionally removes image-based rollback for pre-reset Worker versions but SHALL preserve Worker version/deployment records. Thereafter, releases SHALL retain the current Container image and the nine most recent distinct accepted image digests, plus every additional active, rolling, unresolved-recovery, or uncertain image reference. Ten is a configurable steady-state target, not a hard cap. Cleanup SHALL never delete foreign-repository images, Container applications, secrets, or Durable Object data.

#### Scenario: First clean release resets the legacy image backlog

- **WHEN** the exact new production release passes runtime acceptance and its durable record is saved
- **THEN** the first pass records two matching read-only plans without deleting images; a later pass must repeat the same fingerprint before the one-time reset can remove eligible old images, and the ledger records when pre-reset rollback images are no longer available

#### Scenario: More than ten safe accepted images exist

- **WHEN** at least eleven distinct accepted production images are available and older images have complete trustworthy provenance
- **THEN** the current image and nine most recent distinct prior accepted images remain protected, and only oldest safe surplus images are deletion candidates

#### Scenario: Active or recovery state needs an older image

- **WHEN** a current deployment, running/rolling application, unresolved release journal, or explicit hold references an image outside the nominal window
- **THEN** that image remains protected and total retention may exceed ten

#### Scenario: Provenance or reference state is incomplete

- **WHEN** inventory, timestamps/order, tag-to-digest mapping, provider references, or durable accepted-release history is uncertain
- **THEN** the image is held and no ambiguous candidate is deleted, except that pre-reset images in the exact user-approved repository are eligible for the one-time reset only after exact acceptance and complete active/recovery-reference proof

### Requirement: Container image deletion is bounded, oldest-first, and revalidated

Cleanup SHALL execute sequentially only after acceptance and a matching durable dry-run fingerprint, under the same atomically claimed production exclusion lease as deployment, with a fixed operation deadline and batches of at most ten distinct image digests. A run with more candidates SHALL continue in bounded batches, taking a fresh inventory and rereading protected references before each batch. Before each delete it SHALL durably record the exact tag/digest intent and revalidate lease ownership, production references, and registry tag/digest mapping. An indeterminate delete or failed readback SHALL stop the operation without blind retry. A later operation may reclaim only a retention-owned lease after the prior GitHub run is complete; it must read fresh registry state, resolving an absent tag or keeping a still-present tag uncertain.

#### Scenario: A deletion candidate remains safe

- **WHEN** a candidate is the oldest proven surplus digest, has no protected reference, and all revalidation succeeds
- **THEN** only that candidate's exact repository/tag reference is deleted and post-delete state is read back

#### Scenario: State changes or deletion outcome is uncertain

- **WHEN** a lease/reference/tag mapping changes, deletion times out, or post-delete verification fails
- **THEN** no subsequent candidate is deleted and the healthy accepted deployment is not rolled back or disabled

#### Scenario: Runner is lost after a delete request

- **WHEN** a later retention run finds a durable in-flight tag/digest intent from a completed prior runner
- **THEN** an absent tag resolves that intent from fresh complete inventory; a still-present tag remains uncertain and is not deleted again

### Requirement: Retention reports are reproducible and distinguish estimates

The repository SHALL provide a read-only retention report containing bounded non-secret inventory counts, digests, creation/order evidence, protected/candidate reasons, proposed actions, and cleanup result. Registry byte totals SHALL be labeled as estimates unless Cloudflare provides an authoritative usage figure. Initial rollout SHALL prove stable dry-run behavior before production image deletion is enabled.

#### Scenario: Dry-run sees an unchanged registry

- **WHEN** inventory is read twice without a deployment or registry mutation
- **THEN** the report has the same protected set and oldest-first candidate plan

#### Scenario: Initial cleanup evidence has not been reviewed

- **WHEN** the initial accepted release records a stable dry-run but the repository deletion-enable variable is unset or false
- **THEN** the full plan is reported and no image is deleted; deletion starts only after the reviewed gate is enabled

#### Scenario: Shared layers or multiple tags exist

- **WHEN** tags alias the same digest or manifests share layers
- **THEN** retention counts distinct digests, preserves remaining aliases, and does not overstate reclaimed bytes as provider billing data
