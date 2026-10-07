## MODIFIED Requirements

### Requirement: CI releases execute only trusted exact source

Routine delivery SHALL accept only a full commit that remains an ancestor of the current default-branch head, the checked-out source, and a successful completed trusted default-branch push verification run for the same repository and workflow identity. Both the preflight and protected deploy job SHALL revalidate the candidate before provider mutation. Untrusted PR workflows and stale source MUST NOT acquire production credentials or mutate production. Routine delivery SHALL not require a manual recovery mode.

#### Scenario: PR verification shares a source revision
- **WHEN** a successful PR run exists for a candidate but no successful trusted default-branch push run exists
- **THEN** release preflight fails before provider mutation

#### Scenario: A trusted queued candidate remains eligible after main advances
- **WHEN** an approved candidate remains an ancestor of current remote main
- **THEN** routine delivery deploys that exact candidate rather than substituting a later revision

#### Scenario: A newer deployed descendant supersedes a queued candidate
- **WHEN** current runtime revision is not an ancestor of the candidate
- **THEN** the deploy command stops before provider mutation

#### Scenario: Protected recovery selects a known-green ancestor
- **WHEN** an operator attempts to select a prior commit through a recovery dispatch
- **THEN** no recovery dispatch or manual candidate-selection path exists

#### Scenario: Recovery selects unrelated history
- **WHEN** a commit outside current main history is presented to routine preflight
- **THEN** exact-source validation fails before provider mutation

#### Scenario: Environment protection is missing
- **WHEN** the configured production environment, branch restriction, readiness or required approval is unavailable
- **THEN** the operation fails without exposing deployment secrets to candidate execution

### Requirement: Promotion builds, deploys and verifies one exact candidate

Routine delivery SHALL build and deploy the exact trusted candidate, verify the configured production Worker and Container model before mutation, preserve the configured one-Container limit and safety bindings, and run bounded read-only edge and authenticated service acceptance after deployment. The deployment SHALL use GitHub's serialized production queue and SHALL NOT create or require a persistent deployment lease, transition journal, recovery artifact, predecessor-finalization step, rollback, or recovery dispatch. A failed or cancelled operation SHALL remain a failed release; the workflow SHALL report the observed failure and SHALL NOT claim that the release succeeded.

#### Scenario: A routine release reaches provider checks
- **WHEN** exact-source checks and protected environment approval pass
- **THEN** the workflow builds, checks release access, deploys the exact candidate and runs bounded read-only acceptance in order

#### Scenario: The production model or safety configuration differs
- **WHEN** provider readback shows an unsupported Container model, active rollout, unexpected configuration, secret binding loss, or capacity increase
- **THEN** the workflow stops before deployment and reports failure

#### Scenario: Post-deploy acceptance fails
- **WHEN** edge or authenticated read-only acceptance fails or times out
- **THEN** the workflow reports deployment failure and does not automatically restore or redeploy another version

#### Scenario: A later queued release follows an incomplete attempt
- **WHEN** a prior workflow completed, failed, or was cancelled
- **THEN** the later release is not blocked by a persisted repository lease or journal and relies on current provider preflight before mutation

## REMOVED Requirements

### Requirement: Release ownership and recovery survive runner loss

**Reason**: The owner explicitly chose the simpler serialized build, verify, deploy flow and accepted losing durable cross-run recovery and journal-based release blocking.

**Migration**: Remove the deployment lease, durable journal, recovery/finalization commands, and workflow artifact gates. If a deployment fails or is cancelled, inspect current provider state manually before any corrective action; a future recovery workflow requires a separate decision and specification.

### Requirement: Release summaries distinguish evidence and cleanup state

**Reason**: Automatic image cleanup and its journal-derived summary are deferred rather than blocking routine release delivery.

**Migration**: Routine workflow summaries report candidate build, deployment, and read-only acceptance outcomes only. Do not claim image cleanup or owner/UI acceptance; handle image history through a separately authorized future process.

### Requirement: Worker-version retention remains separate from image retention

**Reason**: Automated image and Worker-version pruning are outside the requested build, verify, deploy flow and depend on the removed lease/journal evidence.

**Migration**: Stop scheduled or post-deploy retention mutations. Existing images and Worker versions are left untouched until a separately reviewed manual cleanup process is implemented.
