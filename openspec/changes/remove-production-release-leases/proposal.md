## Why

The production release queue is spending release time reconciling durable leases and journals whose failure handling can itself prevent a new candidate from building. Routine delivery should be the repository's existing trusted, serialized `main` CI candidate followed by build, provider checks, deploy, and bounded read-only acceptance.

## What Changes

- **BREAKING** Remove persistent deployment leases, durable deployment journals, recovery/reconciliation dispatches, and predecessor-finalization gates.
- Remove retention jobs that depend on deployment journals and lease artifacts; defer image cleanup until it has a separate simple operator workflow.
- Keep exact trusted `main` CI provenance, protected production credentials, GitHub's serialized deployment queue, bounded provider checks, exact candidate deployment, and read-only edge/service acceptance.
- A failed or cancelled deployment reports failure and leaves provider state as observed; the next serialized candidate proceeds through current provider preflight without journal-based recovery or automatic restoration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nemlig-production-delivery`: replace durable lease/journal recovery and automatic retention requirements with serialized build, verify, deploy, and acceptance behavior.
- `nemlig-cloudflare-hosting`: remove duplicate release requirements that still mandate journals, leases, recovery dispatches, or retention.

## Impact

The Nemlig production workflow, deployment and retention scripts/tests, release summaries, OpenSpec, and Cloudflare operations documentation. No runtime package dependencies or application-facing APIs change. This change removes the code that reads or writes release leases and journals. It does not delete historical retention refs, images, or Worker versions; the previously identified shared lease ref was removed separately under the user's explicit authorization.

Goal: routine merged `main` candidates reach build and deployment without lease-artifact reconciliation. Non-goals: changing MCP behavior, basket behavior, provider identity/configuration, feature acceptance scope, or adding a replacement recovery system. Acceptance requires tests proving exact-source/protected-credential gates remain and lease/journal/recovery code is absent from the production path; a failed deployment must remain a failed release and must not be described as a successful deployment.

Epic branch: `codex/remove-production-leasing`; one PR containing this change and its OpenSpec delta.
