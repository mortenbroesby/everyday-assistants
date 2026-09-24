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

After exact deployment acceptance and durable evidence recording, cleanup SHALL retain the ten most recent distinct accepted image digests by default, plus every additional active, rolling, unresolved-recovery, or uncertain image reference. Ten is the default configurable target, not a hard cap. An image without proven accepted-release order SHALL remain protected and be reported; the system SHALL NOT infer that an untracked image is old based on digest, tag, catalog, or deployment-page ordering. Cleanup SHALL never delete foreign-repository images, Container applications, secrets, or Durable Object data.

#### Scenario: First accepted release encounters images without ledger history

- **WHEN** the exact new production release passes runtime acceptance but existing inventory digests have no matching accepted-release evidence
- **THEN** those images remain protected, the report identifies them as untracked and indicates retention is incomplete, and no image is deleted based on guessed age

#### Scenario: An existing ledger branch loses its ledger file

- **WHEN** the retention branch already exists but `retention-ledger.json` is missing or unreadable
- **THEN** retention fails closed before inventory mutation and does not treat the missing file as an empty history; only a branch created by the current run may initialize an empty ledger

#### Scenario: More than ten safe accepted images exist

- **WHEN** more than ten distinct accepted production images are available and older images have complete trustworthy provenance
- **THEN** the ten most recent distinct accepted images remain protected, and only oldest safe surplus images are deletion candidates

#### Scenario: Active or recovery state needs an older image

- **WHEN** a current deployment, running/rolling application, unresolved release journal, or explicit hold references an image outside the nominal window
- **THEN** that image remains protected and total retention may exceed ten

#### Scenario: Provenance or reference state is incomplete

- **WHEN** inventory, timestamps/order, tag-to-digest mapping, provider references, or durable accepted-release history is uncertain
- **THEN** the image is held and no ambiguous candidate is deleted; historical order may be added only from exact durable acceptance evidence matching its commit and digest

### Requirement: Container image deletion is bounded, oldest-first, and revalidated

Cleanup SHALL start in the post-acceptance job only after two same-run inventory/reference snapshots match, under the same atomically claimed production exclusion lease as deployment. It SHALL have no count-based per-run deletion cap. Before each sequential delete it SHALL durably record the exact tag/digest intent and revalidate lease ownership, production references, and registry tag/digest mapping. An indeterminate delete or failed readback SHALL stop the operation without blind retry. An operator may explicitly resume only after the prior GitHub run is complete; it must read fresh registry state, resolving an absent tag or keeping a still-present tag uncertain.

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

The repository SHALL provide a read-only retention report containing non-secret inventory counts, digests, accepted-order evidence, protected/candidate reasons, proposed actions, and cleanup result. Registry byte totals SHALL be labeled as estimates unless Cloudflare provides an authoritative usage figure. The production path SHALL require matching same-run inventory/reference snapshots before deletion.

#### Scenario: Dry-run sees an unchanged registry

- **WHEN** inventory is read twice without a deployment or registry mutation
- **THEN** the report has the same protected set and oldest-first candidate plan

#### Scenario: Same-run inventory/reference snapshots differ

- **WHEN** registry contents or active/recovery references change between the two pre-cleanup snapshots
- **THEN** no image is deleted, the cleanup lease is released, and an explicit later resume must re-read the current state

#### Scenario: Shared layers or multiple tags exist

- **WHEN** tags alias the same digest or manifests share layers
- **THEN** retention counts distinct digests, preserves remaining aliases, and does not overstate reclaimed bytes as provider billing data

### Requirement: Worker version retention is separate and age-bounded

The protected post-acceptance path SHALL treat Worker versions, deployments,
and Container images as separate resources. It SHALL acquire the shared
`codex-lock/nemlig-production` lease before Worker inventory or deletion, list
all Worker versions with complete pagination and cardinality validation, use a
fixed UTC 48-hour cutoff, protect the currently serving version and recovery
references derived from the exact deployment journal, and delete eligible
versions oldest-first only after fresh revalidation and successful absence
readback. Operator-supplied recovery IDs SHALL require explicit reviewed
resume evidence. Each operation SHALL persist a bounded durable report before
and after each provider mutation. An uncertain delete SHALL retain the lease,
record the pending version, and stop without blind retry.

#### Scenario: An old Worker version is safe to remove

- **WHEN** a complete paginated inventory proves a version is older than the
  cutoff and it is neither serving nor a recovery reference
- **THEN** the version is deleted once and a fresh inventory proves it absent

#### Scenario: Worker version state changes during cleanup

- **WHEN** the serving or recovery references change, pagination is incomplete,
  cardinality metadata is inconsistent, or deletion readback is uncertain
- **THEN** cleanup stops without deleting the changed or subsequent version,
  keeps the shared lease, and leaves a durable report that an explicit resume
  can reconcile
