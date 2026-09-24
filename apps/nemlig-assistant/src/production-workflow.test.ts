import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../../../.github/workflows/nemlig-production.yml", import.meta.url);
const ciWorkflowPath = new URL("../../../.github/workflows/ci.yml", import.meta.url);
const retentionScriptPath = new URL("../scripts/production-retention.ts", import.meta.url);

const section = (source: string, heading: string): string => {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing workflow section: ${heading}`);
  const rest = source.slice(start + heading.length + 1);
  const indentation = heading.length - heading.trimStart().length;
  const next = rest.search(new RegExp(`^ {0,${indentation}}\\S`, "m"));
  return next === -1 ? rest : rest.slice(0, next);
};

test("routine releases queue exact-CI candidates; manual dispatch is recovery, reconciliation, or retention recovery only", async () => {
  const source = await readFile(workflowPath, "utf8");
  const trigger = section(source, "on:");
  assert.match(trigger, /^\x20{2}workflow_dispatch:\n/m);
  assert.match(trigger, /^\x20{2}workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]/m);
  assert.doesNotMatch(trigger, /^\x20{2}(?:schedule|push|pull_request):/m);
  assert.match(trigger, /commit:\n\s+description:.*recovery/m);
  assert.match(trigger, /commit:[\s\S]*?required: true[\s\S]*?type: string/m);
  assert.match(trigger, /recovery:[\s\S]*?required: true[\s\S]*?type: boolean/m);
  assert.match(trigger, /resume_retention:[\s\S]*?required: false[\s\S]*?type: boolean/m);
  assert.match(trigger, /reconcile_operation:[\s\S]*?required: false[\s\S]*?type: string/m);
  assert.doesNotMatch(trigger, /cutover:|finalize_operation:/u);
  assert.match(source, /^concurrency:\n\x20{2}group: nemlig-production\n\x20{2}cancel-in-progress: false\n\x20{2}queue: max$/m);
  assert.match(source, /^permissions:\n(?:\x20{2}#.*\n)*\x20{2}contents: write$/m);

  const gate = section(source, "  release-gate:");
  const preflight = section(source, "  preflight:");
  const deploy = section(source, "  deploy:");
  const retention = section(source, "  retention:");
  assert.match(gate, /inputs\.recovery == true/u);
  assert.match(gate, /inputs\.resume_retention == true/u);
  assert.match(gate, /inputs\.reconcile_operation != ''/u);
  assert.match(gate, /permissions:\n\s+contents: read\n\s+actions: read/u);
  assert.doesNotMatch(gate, /catch-up|retention-ledger|gh api/u);
  assert.doesNotMatch(gate, /\.cleanup|retention-lease|RETENTION_ENABLED|dryRunFingerprint/u);
  assert.match(gate, /retention_commit=\$CANDIDATE_SHA/u);
  assert.match(gate, /RESUME_RETENTION/u);
  assert.match(gate, /Recovery deployment and retention resume are mutually exclusive/u);
  assert.match(gate, /Check exact main candidate/u);
  assert.match(gate, /git merge-base --is-ancestor "\$CANDIDATE_SHA" origin\/main/u);
  assert.ok(gate.includes('if [[ "$RECOVERY" == "true" || "$RESUME_RETENTION" == "true" || -n "$RECONCILE_OPERATION" ]]; then\n            if ! git merge-base --is-ancestor "$CANDIDATE_SHA" origin/main;')
    && gate.includes('elif [[ "$CANDIDATE_SHA" != "$(git rev-parse origin/main)" ]]; then'),
    "only an explicitly confirmed recovery may deploy an ancestor; routine runs must target current main exactly");
  assert.doesNotMatch(gate, /production:retention|CLOUDFLARE|secrets\./u);
  assert.doesNotMatch(gate, /gh run list|headSha/u);
  assert.match(gate, /echo "deploy=false" >> "\$GITHUB_OUTPUT"/u);
  assert.doesNotMatch(gate, /pull-requests: read|deploy:nemlig-production|\/pulls|merge_commit_sha/u);
  assert.match(gate, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(gate, /ref: "\$\{\{ env\.CANDIDATE_SHA \}\}"/u);
  assert.match(gate, /persist-credentials: false/u);
  assert.match(gate, /fetch-depth: 0/u);
  assert.match(gate, /git fetch origin refs\/heads\/main:refs\/remotes\/origin\/main/u);
  assert.match(gate, /git merge-base --is-ancestor "\$CANDIDATE_SHA" origin\/main/u);
  assert.match(gate, /\[\[ "\$CANDIDATE_SHA" != "\$\(git rev-parse origin\/main\)" \]\]/u);
  assert.match(gate, /\[\[ "\$CANDIDATE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u);
  assert.doesNotMatch(gate, /check:version-bump|check:release-note|CANDIDATE_PARENT|policy\.eligible/u);
  assert.match(gate, /echo "deploy=true" >> "\$GITHUB_OUTPUT"/u);
  assert.match(gate, /echo "reconcile=true" >> "\$GITHUB_OUTPUT"/u);
  assert.doesNotMatch(gate, /FINALIZE_OPERATION|CUTOVER/u);
  assert.doesNotMatch(gate, /CLOUDFLARE|NEMLIG_MCP|secrets\./u);
  assert.match(preflight, /needs: release-gate/u);
  assert.match(preflight, /needs\.release-gate\.outputs\.deploy == 'true'/u);
  assert.match(preflight, /timeout-minutes: 30/u);
  assert.match(preflight, /permissions:\n\s+contents: read\n\s+actions: read/u);
  assert.match(preflight, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(preflight, /persist-credentials: false/u);
  assert.match(preflight, /pnpm install --frozen-lockfile/u);
  assert.match(preflight, /production:deploy -- preflight "\$CANDIDATE_SHA"/u);
  assert.match(preflight, /production:deploy -- preflight --recovery "\$CANDIDATE_SHA"/u);
  assert.match(preflight, /env:\n\s+GH_TOKEN:/u);

  assert.match(deploy, /needs: \[release-gate, preflight\]/u);
  assert.match(deploy, /needs\.release-gate\.outputs\.deploy == 'true'/u);
  assert.match(deploy, /environment:\n\s+name: nemlig-production/u);
  assert.match(deploy, /permissions:\n\s+contents: write\n\s+actions: read/u);
  assert.match(deploy, /pnpm install --frozen-lockfile/u);
  assert.match(deploy, /pnpm --filter nemlig-assistant build/u);
  assert.match(deploy, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(deploy, /NEMLIG_MCP_SERVICE_CLIENT_ID:/u);
  assert.match(deploy, /NEMLIG_MCP_SERVICE_CLIENT_SECRET:/u);
  assert.match(deploy, /NEMLIG_MCP_AUTH0_ISSUER: https:\/\/everyday-assistants\.eu\.auth0\.com\//u);
  assert.match(deploy, /NEMLIG_MCP_PUBLIC_URL: https:\/\/nemlig-mcp\.broesby\.dk\/mcp/u);
  assert.match(deploy, /RUNNER_TEMP\/nemlig-release\.json/u);
  assert.match(deploy, /pnpm --silent --filter nemlig-assistant production:deploy/u);
  assert.match(deploy, /production:deploy -- --recovery "\$CANDIDATE_SHA"/u);
  assert.match(deploy, /\.git\/nemlig-production-deploy\/latest\.json/u);
  assert.match(deploy, /actions\/upload-artifact@[0-9a-f]{40}/u);
  assert.match(deploy, /id: release-artifact/u);
  assert.match(deploy, /if-no-files-found: error/u);
  assert.match(deploy, /retention-days: 7/u);
  assert.match(deploy, /include-hidden-files: true/u);
  assert.doesNotMatch(source, /setup-.*provider|activate|cloudflare\/workers/u);

  assert.match(retention, /needs: \[release-gate, preflight, deploy\]/u);
  assert.match(retention, /needs\.deploy\.result == 'success' \|\| needs\.release-gate\.outputs\.retention == 'true'/u);
  assert.match(retention, /environment:\n\s+name: nemlig-production/u);
  assert.match(retention, /permissions:\n\s+contents: write\n\s+actions: read/u);
  assert.match(retention, /actions\/download-artifact@[0-9a-f]{40}/u);
  assert.match(retention, /production:retention -- accept "\$CANDIDATE_SHA"/u);
  assert.match(retention, /production:retention -- resume "\$\{\{ needs\.release-gate\.outputs\.retention_commit \}\}"/u);
  assert.match(retention, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(retention, /NEMLIG_CONTAINER_IMAGE_RETENTION_COUNT: "\$\{\{ vars\.NEMLIG_CONTAINER_IMAGE_RETENTION_COUNT \|\| '10' \}\}"/u);
  assert.doesNotMatch(retention, /NEMLIG_CONTAINER_IMAGE_RETENTION_ENABLED/u);
  assert.match(retention, /scheduled without accepted deployment or explicit resume/u);
  assert.doesNotMatch(preflight, /CLOUDFLARE|secrets\./u);
});

test("image pruning takes and fences the shared deployment lease", async () => {
  const [workflow, script] = await Promise.all([readFile(workflowPath, "utf8"), readFile(retentionScriptPath, "utf8")]);
  const retention = section(workflow, "  retention:");
  assert.match(retention, /permissions:\n\s+contents: write\n\s+actions: read/u);
  assert.match(script, /const lockBranch = "codex-lock\/nemlig-production"/u);
  assert.match(script, /POST", "git\/refs", \{ ref: "refs\/heads\/" \+ lockBranch/u);
  assert.match(script, /PATCH", "git\/refs\/heads\/" \+ lockBranch, \{ sha: newHead, force: false \}/u);
  assert.match(script, /actions\/runs\/" \+ prior\.runId/u);
  assert.match(script, /retentionLeaseCanBeReclaimed\(prior/u);
  assert.match(script, /"containers", "instances", current\.id, "--json"/u);
  assert.match(script, /assertNoContainerRollout\(instances, current\.version\)/u);
  assert.match(script, /readHolds: async[\s\S]*?assertRetentionLeaseForMutation\(mode,[\s\S]*?assertOwned: assertRetentionLease/u);
  assert.match(script, /const deleteTag = async[\s\S]*?await assertRetentionLease\(\)/u);
  assert.match(script, /await releaseRetentionLease\(\);\n\s+console\.log\(JSON\.stringify\(\{ \.\.\.report/u);
});

test("routine deployment does not require a historical cutover artifact", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.doesNotMatch(source, /verifyRoutineRelease|service_cutover_required|service-cutover|finalize_operation|CUTOVER/u);
  assert.match(source, /production:deploy -- --service "\$CANDIDATE_SHA"/u);
  assert.match(source, /production:deploy -- finalize "\$operation_id" --evidence-saved --original-runner-stopped/u);
});

test("routine recovery finalization only runs after a successful provider deployment", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /- name: Deploy exact approved merge\n\s+id: deploy/u);
  assert.match(source, /if: \$\{\{ always\(\) && steps\.deploy\.outcome == 'success' && steps\.release-artifact\.outcome == 'success' \}\}/u);
});

test("CI does not gate verification on release metadata", async () => {
  const source = await readFile(ciWorkflowPath, "utf8");
  assert.doesNotMatch(source, /check:version-bump|check:release-note/u);
  assert.match(source, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/u);
});

test("deployment eligibility does not depend on release metadata", async () => {
  const source = await readFile(workflowPath, "utf8");
  const gate = section(source, "  release-gate:");
  assert.doesNotMatch(gate, /check:version-bump|check:release-note|nemligRelease|codename/u);
  assert.doesNotMatch(gate, /publish=true|outputs\.publish/u);
  assert.doesNotMatch(gate, /GH_TOKEN:|github\.token/u);
  assert.doesNotMatch(gate, /CLOUDFLARE|secrets\.|pull-requests: read|\/pulls/u);
});

test("deployment evidence remains artifact-backed without a publication side effect", async () => {
  const source = await readFile(workflowPath, "utf8");
  const deploy = section(source, "  deploy:");

  assert.match(deploy, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/u);
  assert.match(deploy, /id: release-artifact/u);
  assert.match(deploy, /if-no-files-found: error/u);
  assert.match(deploy, /retention-days: 7/u);
  assert.doesNotMatch(source, /^\x20{2}publish-release:/m);
  assert.doesNotMatch(source, /publish:deployment-release/u);
});

test("manual dispatch requires recovery intent and cannot finalize arbitrary operations", async () => {
  const source = await readFile(workflowPath, "utf8");
  const trigger = section(source, "on:");
  const gate = section(source, "  release-gate:");
  assert.match(trigger, /recovery:[\s\S]*?required: true[\s\S]*?type: boolean/m);
  assert.match(trigger, /resume_retention:[\s\S]*?required: false[\s\S]*?type: boolean/m);
  assert.match(trigger, /reconcile_operation:[\s\S]*?required: false[\s\S]*?type: string/m);
  assert.match(gate, /inputs\.(recovery|resume_retention) == true/u);
  assert.match(gate, /inputs\.reconcile_operation != ''/u);
  assert.doesNotMatch(source, /finalize_operation:|^ {2}finalize:/m);
});

test("manual recovery can reconcile an exact pending rollback and release its lease", async () => {
  const source = await readFile(workflowPath, "utf8");
  const reconcile = section(source, "  reconcile:");
  assert.match(reconcile, /needs: release-gate/u);
  assert.match(reconcile, /needs\.release-gate\.outputs\.reconcile == 'true'/u);
  assert.match(reconcile, /environment:\n\s+name: nemlig-production/u);
  assert.match(reconcile, /permissions:\n\s+contents: write\n\s+actions: read/u);
  assert.match(reconcile, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(reconcile, /pnpm install --frozen-lockfile/u);
  assert.match(reconcile, /production:deploy -- reconcile-recovery "\$RECONCILE_OPERATION" --evidence-saved --original-runner-stopped/u);
  assert.match(reconcile, /production:deploy -- finalize "\$RECONCILE_OPERATION" --evidence-saved --original-runner-stopped/u);
  assert.match(reconcile, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(reconcile, /GH_TOKEN:/u);
  assert.doesNotMatch(reconcile, /NEMLIG_MCP_SERVICE_CLIENT_SECRET/u);
});

test("routine recovery finalizes only after its artifact is saved", async () => {
  const deploy = section(await readFile(workflowPath, "utf8"), "  deploy:");
  const upload = deploy.indexOf("uses: actions/upload-artifact@");
  const finalize = deploy.indexOf("production:deploy -- finalize");
  assert.ok(upload >= 0 && finalize > upload);
  assert.match(deploy, /if: \$\{\{ always\(\) && steps\.deploy\.outcome == 'success' && steps\.release-artifact\.outcome == 'success' \}\}/u);
  assert.match(deploy, /JSON\.parse\(readFileSync\(process\.argv\[1\], "utf8"\)\)/u);
  assert.match(deploy, /GITHUB_WORKSPACE\/\.git\/nemlig-production-deploy\/latest\.json/u);
  assert.doesNotMatch(deploy, /readFileSync\([^\n]*RUNNER_TEMP\/nemlig-release\.json/u);
  assert.match(deploy, /\^\[0-9a-f\]\{8\}\(\?:-\[0-9a-f\]\{4\}\)\{3\}-\[0-9a-f\]\{12\}\$/u);
  assert.match(deploy, /finalize "\$operation_id" --evidence-saved --original-runner-stopped/u);

  const finalization = deploy.slice(deploy.lastIndexOf("      - name:", finalize));
  assert.match(finalization, /GH_TOKEN:/u);
  assert.match(finalization, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(finalization, /CLOUDFLARE_ACCOUNT_ID:/u);
  assert.doesNotMatch(finalization, /NEMLIG_MCP_SERVICE_CLIENT_SECRET/u);
});
