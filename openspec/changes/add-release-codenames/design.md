## Context

See `proposal.md` for motivation. The current package version is the canonical
release identifier: the release agent derives it from the exact Git range,
stores it in `package.json`, requires a version-addressed note, and the
production workflow publishes `nemlig-assistant-v<version>` only after the exact
commit deploys successfully. MCP initialization already exposes the package
version and supplies model-visible instructions. Non-release changes are
deliberately excluded from versioning and deployment.

## Goals / Non-Goals

**Goals:**

- Extend the existing release identity with one deterministic codename without
  creating a parallel release system.
- Keep planning/apply, validation, deployment proof, MCP presentation, and
  GitHub publication consistent and retry-safe.
- Let ChatGPT answer from initialization context with no additional tool or
  request.

**Non-Goals:**

- Give names to merges that do not produce a Nemlig deployment.
- Add mutable release state, provider configuration, or a second version stream.
- Encode codenames in SemVer or retrofit historical releases.

## Decisions

### Store the candidate codename beside the package version

Add one bounded `nemligRelease.codename` string to the existing package
manifest. Runtime, validation, notes, and publication read the pair from the
same exact candidate. The release agent treats its own version-and-codename
manifest update as release metadata when determining whether apply is already
idempotent, while rejecting manual or inconsistent codename changes.

This reuses the file every release-bearing pull request already changes and
packs the identity with the application. A separate registry file was rejected
because it would introduce another synchronization boundary; deriving a name
only from the version at display time was rejected because it would not leave a
reviewed, explicit release identity in the candidate.

### Use plain SemVer and keep codename separate

New candidates use strict `major.minor.patch`. The first candidate migrates the
historical `major.minor.patch-alpha.increment` value to the plain version chosen
by its release kind. Later release-bearing changes advance major, minor, or
patch normally. Internal-only and non-release changes leave both version and
codename unchanged; the old independent alpha increment is removed.

Keeping `nemligRelease.codename` separate avoids conflating a human release name
with SemVer prerelease precedence. Encoding the codename as a SemVer suffix was
rejected because the package version already identifies the release and the
separate reviewed metadata is the source used by notes and ChatGPT.

### Use a deterministic NATO-style sequence

Keep the ordered words in the release policy code. With no codename on the
historical baseline, the first release produced by this change is `Alpha`;
subsequent releases advance through `Bravo` to `Zulu`, then `Alpha-2` through
`Zulu-2`, and so on. Parsing is strict and case-sensitive.

This is predictable, testable, and requires no name service or subjective name
selection. Arbitrary Linux-style names were rejected because collision checks
and human selection would make automated release apply less reliable.

### Bind codename validation to the existing exact-range gate

Release planning reports `currentCodename` and `targetCodename`. Apply updates
version and codename in one manifest write. Exact-candidate validation computes
the expected successor from the merge parent and requires the manifest and
version-addressed release note to match it. Non-release decisions neither
advance nor validate a new name. The no-release override cannot be used to slip
a codename-only change into main.

The existing candidate SHA remains the deployment journal's cryptographic Git
binding; no journal schema migration is needed. Publication reads the exact
candidate manifest and note, while the journal proves that same SHA deployed
and passed acceptance.

### Keep the stable tag and add the codename to human-facing release text

Tags remain `nemlig-assistant-v<version>` so retries, automation, and semantic
ordering remain compatible. The release note heading and GitHub prerelease name
become `Nemlig Assistant <version> - <codename>` using an ASCII separator in
machine-validated text. Existing releases remain untouched.

Changing the tag was rejected because the version already provides a unique,
stable automation key. Adding the codename only to release prose was rejected
because it would not be validated against the deployed artifact.

### Put the deployed identity in MCP instructions

Runtime exports the validated version/codename pair. `createMcpServer` prefixes
its existing instructions with a short sentence such as `Current release:
4.8.0 - Alpha.` The server name, title, semantic version, icon, tools,
and resources remain unchanged. The package and interface smoke checks verify
the sentence.

This is the smallest model-visible surface and costs no tool slot or network
request. A dedicated release-info tool and a renamed app title were rejected as
unnecessary surface expansion and compatibility churn.

## Risks / Trade-offs

- [Historical tags use alpha prerelease versions] -> Accept them only as the
  migration baseline; all new candidates and tags use plain SemVer.
- [Concurrent release-bearing pull requests select the same successor] -> Keep
  the current exact-base/version gate; the later pull request must refresh its
  version and codename together after the first merges.
- [Main contains candidate metadata before deployment completes] -> Call it a
  candidate until the existing exact deployment and terminal acceptance pass;
  production continues reporting its previously deployed artifact.
- [Publication fails after deployment] -> Retry from the immutable candidate;
  strict readback accepts only matching tag, target, title, body, version, and
  codename.
- [The sequence eventually repeats words] -> Add the cycle suffix after every 26
  releases; the full version/codename pair remains unique and unambiguous.

## Migration Plan

1. Add strict codename parsing/sequencing, replace the old alpha increment with
   plain SemVer, and characterize release planning, apply, candidate validation,
   and retry behavior from the historical baseline without a codename.
2. Apply the first candidate codename (`Alpha`) together with this pull
   request's normal version decision and matching release note.
3. Expose and verify the pair in runtime/MCP instructions and GitHub publication
   while retaining existing tags and journal schema.
4. Run repository, package, privacy, OpenSpec, and credential-free Cloudflare
   gates. Merge through the protected pull request path only after review.
5. If separately authorized by the existing merge-time release contract, deploy
   the exact merge and verify production reports the new pair before publication
   readback. Rollback restores the prior artifact, which continues to report its
   prior version without a codename; do not rewrite historical releases.
