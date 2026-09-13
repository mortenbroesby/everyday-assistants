## 1. Provider contract and baseline

- [ ] 1.1 Reproduce the production registry inventory with complete pagination and record tag, manifest, unique-blob, logical-byte and deduplicated-byte counts; verify a second read-only run returns the same digest graph when no deployment occurs.
- [ ] 1.2 Establish the exact installed Wrangler/API image-tag deletion and alias behavior using authoritative documentation or a disposable non-production image; verify that no Container application, Worker, Durable Object or foreign repository is affected.
- [ ] 1.3 Enumerate every Cloudflare deployment, Worker version, Container application and active-instance reference needed for the protected set; verify an intentionally incomplete or unknown response blocks planning.
- [ ] 1.4 Determine the minimum Cloudflare permission used for registry inventory and deletion without printing credentials; record any required permission change as an operator checkpoint before provider mutation.

## 2. Accepted release ledger

- [ ] 2.1 Define the bounded versioned ledger and cleanup-report schemas using only public-safe deployment evidence; verify parsers reject unknown fields, malformed digests, invalid runs, oversized documents and inconsistent accepted states.
- [ ] 2.2 Reuse the existing compare-and-write Git data helpers for a dedicated retention state ref; verify create, update, conflict, readback, missing-ref and corrupt-ledger cases without writing `main`.
- [ ] 2.3 Record an accepted image from a terminal-success deployment journal before lease release; verify duplicate operations and repeated digests are idempotent and failed, pending, rolled-back or live-acceptance-pending journals do not qualify.
- [ ] 2.4 Bootstrap only releases with trustworthy retained acceptance evidence and represent every ambiguous historical image as a legacy hold; verify no held image becomes a deletion candidate.

## 3. Inventory and retention planner

- [ ] 3.1 Implement the smallest read-only registry adapter needed to enumerate the exact Nemlig repository and resolve tags, image indexes, manifests, configs and compressed layers; verify pagination, aliases, shared layers, unknown media types and foreign repositories.
- [ ] 3.2 Implement a pure retention planner that protects the current digest, nine prior distinct accepted digests, active references, unresolved recovery images and unexpired holds; verify 0, 1, 10 and 11-or-more release cases plus rollback to an older current image.
- [ ] 3.3 Apply the seven-day grace rule to trustworthy unaccepted build images and retain unknown-age images; verify clock boundaries and missing provenance fail closed.
- [ ] 3.4 Calculate logical, deduplicated and exclusively reclaimable compressed bytes without pulling or building images; verify shared blobs are counted once and reports label values as registry-content estimates.
- [ ] 3.5 Add a repository command that emits a bounded non-secret dry-run report and performs no mutation; verify repeated execution is stable against an unchanged registry snapshot.

## 4. Bounded cleanup under the release lease

- [ ] 4.1 Add a deletion adapter scoped to the exact production repository, fixed deadlines and sequential operations; verify it cannot invoke Container-application deletion or address a foreign repository.
- [ ] 4.2 Revalidate the production lease, Worker/Container references and tag-to-digest mapping before every deletion; verify lease loss or provider drift stops the current and remaining candidates.
- [ ] 4.3 Limit one run to ten distinct candidate digests and stop on an indeterminate result without retry; verify partial results are recorded and require fresh inventory reconciliation.
- [ ] 4.4 Read back registry inventory and every protected manifest after the batch; verify missing protected content makes cleanup fail independently from deployment health.
- [ ] 4.5 Integrate accepted-release recording and cleanup after saved acceptance evidence but before `releaseDeploymentLeases`; verify cleanup failure never rolls back a healthy release, changes `MCP_ENABLED`, or leaves the lease indefinitely held.

## 5. Workflow and evidence

- [ ] 5.1 Extend the production workflow with cleanup mode and bounded report artifacts while preserving its existing concurrency and protected environment; verify workflow contract tests prove no cleanup runs for skipped, failed or pending deployments.
- [ ] 5.2 Default production cleanup to dry-run and add an independent cleanup-disable control; verify disabling cleanup does not disable deployment or change the MCP kill switch.
- [ ] 5.3 Run focused deployment, workflow, ledger and retention tests, then run the package verification gate; verify no new runtime dependency, hosted service, scheduled job, Container wake or Nemlig request was introduced.

## 6. Production rollout checkpoint

- [ ] 6.1 Merge and deploy the dry-run implementation through the protected release path; verify exact-main CI and production acceptance succeed and save the current protected/candidate report without deleting images.
- [ ] 6.2 Review the dry-run report, provider deletion semantics, minimum permission and legacy holds with the owner; obtain separate explicit approval before enabling Cloudflare image deletion or changing provider credentials.
- [ ] 6.3 After approval, enable a first bounded sweep of at most ten digests during an accepted deployment; verify the current and nine prior accepted images, every extra protected reference, Worker/Container state and production health remain intact.
- [ ] 6.4 Continue post-deploy cleanup until policy converges; add a scheduled reconciliation only if recorded evidence shows images accumulating without accepted deployments.

## 7. Documentation and delivery

- [ ] 7.1 Update Cloudflare operations and backlog documentation with inventory, dry-run, enable/disable, partial-result reconciliation, legacy holds, the image-backed rollback horizon and the distinction between Worker audit history and usable images; verify documented commands are read-only unless clearly marked as destructive.
- [ ] 7.2 Select the one package version and release note for the implementation epic, archive this OpenSpec change after its acceptance is complete, and run `pnpm verify` once on the final candidate.
- [ ] 7.3 Commit and push checkpoint slices, open one implementation pull request, merge through the active ruleset, verify exact integrated `main` CI, deploy at most once for the final enabled candidate, and record remote commit, production revision and cleanup evidence.
