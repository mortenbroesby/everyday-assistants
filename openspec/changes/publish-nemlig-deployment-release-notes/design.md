## Context

The completed `streamline-agent-and-release-flow` change already makes the
version-policy decision select production deployments after exact-head CI. The
production job emits a schema-2 `DeploymentJournal`, while
`production-cutover.json.acceptedRevision` records a historical cutover
ancestor and is not evidence of the current deployed revision.

The package is intentionally private. The existing distribution specification
therefore prohibits all tags as well as npm publication, which must be narrowed
before a GitHub application release can truthfully be published.

## Goals / Non-Goals

**Goals:**

- Give every deployed Nemlig epic a concise, reviewed, agent-authored release
  summary that can be published deterministically.
- Bind note, manifest version, candidate SHA, exact CI, deployment evidence,
  release tag, and GitHub prerelease into one fail-closed chain.
- Make publication safely resumable without retargeting a tag or repeating a
  healthy production deployment.
- Use a tiny behavior-preserving runtime cleanup as the first release trial.

**Non-Goals:**

- Publishing to npm, enabling external package installation, generating notes
  from commit messages, calling an LLM in CI, changing deployment selection, or
  changing product matching behavior.

## Decisions

### Commit one reviewed note per package version

The source of truth is
`apps/nemlig-assistant/release/notes/<version>.md`. It is authored by the coding
agent during the epic and summarized in the pull request. Validation requires a
release-bearing candidate to include exactly its target-version note in the
candidate diff, with bounded, non-empty Markdown content. The validator reuses
the existing exact base/head changed-file reader and release decision rather
than introducing another path classifier.

PR bodies and generated commit lists were rejected as publication sources
because they are mutable or too atomic. A live LLM in deployment CI was rejected
because reviewed prose should already be immutable in the candidate.

### Publish only from successful routine deployment evidence

A downstream publication job depends on the main-only deploy job, downloads the
deployment artifact produced by that job, checks out the exact candidate, and
validates before any GitHub write:

- journal schema is 2 and `commit` equals the candidate SHA;
- `outcome` is `success`, `lastVerifiedState` is `enabled`, and completion is
  recorded;
- the producing workflow run identity is the expected run;
- checks include `edge_acceptance` and `service_fixture_acceptance`;
- checks exclude `live_acceptance_pending`.

The journal's `commit` is authoritative for this deployment. The cutover
configuration's `acceptedRevision` must never be substituted for it. Manual
finalize-only runs and supervised cutovers do not publish a fresh release.

### Make GitHub publication strict and resumable

The prerelease tag is `nemlig-assistant-v<version>` and must resolve to the exact
deployed candidate. The body is the committed note plus deterministic commit,
CI, and deployment links. First publication creates the tag and prerelease;
matching existing state is a no-op; a matching tag without a release resumes
creation. Conflicting tag targets, bodies, versions, or metadata fail without
overwrite. After an uncertain API result the publisher reads back state before
retrying.

The publication job receives only repository `contents: write`; it introduces
no credential. A failed publication can be rerun independently within the
artifact retention window and does not roll back healthy production.

### Keep the trial refactor behavior-preserving

`relevantProduct` will materialize its deduplicated requested words once and
reuse the ordered array instead of repeatedly spreading one `Set`. Direct
characterization covers duplicates, empty and quantity-only queries, Danish
accents, pet requests and products, compound joining, and the five-character
prefix boundary. Normalization, insertion order, filtering, and short-circuit
behavior remain unchanged. Its `words` helper stays separate from
`plan-calculation.ts` because their Unicode semantics intentionally differ.

## Risks / Trade-offs

- [Agent prose is incomplete] -> deterministic validation proves structure and
  identity; pull-request review judges substance.
- [A stale or forged artifact publishes a release] -> bind journal commit, run,
  terminal state, and routine acceptance checks before any write.
- [Publication partially succeeds] -> reconcile tag and release state, resume
  only matching state, and never retarget or overwrite conflicts.
- [Retry artifact expires] -> document the existing seven-day recovery window;
  outside it, require explicit operator reconciliation rather than redeployment.
- [Release automation weakens private-package posture] -> keep `private: true`
  and every npm publication path disabled; permit only GitHub application tags.

## Migration Plan

1. Add characterization and release-tool tests before implementation.
2. Add the minimal note validator, deployment-evidence validator, and idempotent
   GitHub publisher without a new dependency.
3. Wire exact-range CI validation and a downstream publication job while
   preserving recovery behavior and moving the sole human release decision to
   explicit pull-request approval before merge.
4. Calculate the final patch prerelease, commit its agent-authored note, run the
   full repository gate, and merge one epic pull request.
5. Approve the release-bearing pull request before merge, then verify the
   automatic production deployment and prerelease tag, body, and target SHA
   against the journal.

Rollback disables/removes only the downstream publication job. It does not roll
back a healthy production deployment. A published immutable tag is retained as
historical evidence unless an explicit operator decision says otherwise.

## Unknown Register

- Artifact retry provenance: resolve in implementation by validating producing
  run identity and testing publisher-only recovery from the retained artifact.
- Repository tag policy: inspect read-only before integration; retain existing
  protections and escalate an evidenced conflict instead of weakening them.
- Human prose quality: pull-request review remains the judgment point; CI only
  validates bounded structure and exact identity.
