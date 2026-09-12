## 1. Establish the agent artifact contract

- [x] 1.1 Inventory root, scoped, lifecycle, skill, OpenSpec, GitHub, and validator surfaces; record intentional collection-level entries and current routing gaps.
- [x] 1.2 Define manifest schema, instruction precedence, task routes, authority boundary, and drift-validation behavior in proposal, design, and delta spec.

## 2. Add the inventory and validation

- [x] 2.1 Add a complete `.agents/manifest.json` with stable artifact ids, scopes, use conditions, relationships, and common task routes; verify every maintained instruction and skill is registered.
- [x] 2.2 Add failing Node tests for malformed metadata, unsafe paths, invalid references and cycles, and unregistered guidance, then implement the smallest dependency-free validator that passes them.
- [x] 2.3 Wire one agent-artifact check into the existing root verification command without adding a workflow or dependency.
- [x] 2.4 Add focused repository-local skills for roadmap triage and agent-artifact maintenance; register their distinct triggers and avoid duplicating the mandatory epic-delivery workflow.

## 3. Make instructions route deterministically

- [x] 3.1 Turn root `AGENTS.md` into the universal entry point and move detailed delivery mechanics into one mandatory repository-workflow instruction; verify every original policy remains represented.
- [x] 3.2 Route Nemlig repository, production, and basket tasks to their distinct app-local skills, update the local skill index, and repair touched broken relative links without changing their safety contracts.
- [x] 3.3 Reconcile release prose with the current merge-approved automatic post-merge workflow; verify repository-only changes remain release-ineligible and require no deployment.

## 4. Verify and deliver the pull request

- [x] 4.1 Run the focused validator tests and check, strict OpenSpec validation, and privacy validation; resolve only failures caused by this change.
- [x] 4.2 Run one final `pnpm verify`, review the diff for policy loss, secrets, unrelated edits, dependencies, cost, and scope growth, and refresh the code index where supported.
- [ ] 4.3 Commit and push the epic branch, open one pull request, and verify required CI for its exact head succeeds. Keep merge behind explicit user approval and do not deploy.
