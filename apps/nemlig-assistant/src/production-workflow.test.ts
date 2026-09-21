import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../../../.github/workflows/nemlig-production.yml", import.meta.url);
const ciWorkflowPath = new URL("../../../.github/workflows/ci.yml", import.meta.url);

const section = (source: string, heading: string): string => {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing workflow section: ${heading}`);
  const rest = source.slice(start + heading.length + 1);
  const indentation = heading.length - heading.trimStart().length;
  const next = rest.search(new RegExp(`^ {0,${indentation}}\\S`, "m"));
  return next === -1 ? rest : rest.slice(0, next);
};

test("production workflow accepts manual dispatch or an exact CI-green main commit", async () => {
  const source = await readFile(workflowPath, "utf8");
  const trigger = section(source, "on:");
  assert.match(trigger, /^\x20{2}workflow_dispatch:\n/m);
  assert.match(trigger, /^\x20{2}workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]/m);
  assert.doesNotMatch(trigger, /^\x20{2}(?:push|pull_request|schedule):/m);
  assert.match(trigger, /commit:\n\s+description:.*commit/m);
  assert.match(trigger, /commit:[\s\S]*?required: true[\s\S]*?type: string/m);
  assert.match(trigger, /cutover:[\s\S]*?default: false[\s\S]*?type: boolean/m);
  assert.match(trigger, /recovery:[\s\S]*?description:.*previously green main ancestor[\s\S]*?default: false[\s\S]*?type: boolean/m);
  assert.match(source, /^concurrency:\n\x20{2}group: nemlig-production\n\x20{2}cancel-in-progress: false$/m);

  const gate = section(source, "  release-gate:");
  const preflight = section(source, "  preflight:");
  const deploy = section(source, "  deploy:");
  assert.doesNotMatch(gate, /pull-requests: read|deploy:nemlig-production|\/pulls|merge_commit_sha/u);
  assert.match(gate, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(gate, /ref: "\$\{\{ env\.CANDIDATE_SHA \}\}"/u);
  assert.match(gate, /persist-credentials: false/u);
  assert.match(gate, /fetch-depth: 0/u);
  assert.match(gate, /git fetch origin refs\/heads\/main:refs\/remotes\/origin\/main/u);
  assert.match(gate, /\[\[ "\$\(git rev-parse origin\/main\)" != "\$CANDIDATE_SHA" \]\]/u);
  assert.match(gate, /git merge-base --is-ancestor "\$CANDIDATE_SHA" origin\/main/u);
  assert.match(gate, /Candidate is no longer current main/u);
  assert.match(gate, /\[\[ "\$CANDIDATE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u);
  assert.doesNotMatch(gate, /check:version-bump|check:release-note|CANDIDATE_PARENT|policy\.eligible/u);
  assert.match(gate, /echo "deploy=true" >> "\$GITHUB_OUTPUT"/u);
  assert.match(gate, /FINALIZE_OPERATION/u);
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
  assert.match(deploy, /retention-days: 7/u);
  assert.match(deploy, /include-hidden-files: true/u);
  assert.doesNotMatch(source, /setup-.*provider|activate|cloudflare\/workers/u);
});

test("routine deployment does not require a historical cutover artifact", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.doesNotMatch(source, /verifyRoutineRelease|service_cutover_required/u);
  assert.match(source, /production:deploy -- --service "\$CANDIDATE_SHA"/u);
  assert.match(source, /production:deploy -- --service-cutover "\$CANDIDATE_SHA"/u);
  assert.match(source, /production:deploy -- finalize "\$FINALIZE_OPERATION"/u);
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
  assert.doesNotMatch(gate, /GH_TOKEN|pull-requests: read|\/pulls/u);
});

test("deployment evidence remains artifact-backed without a publication side effect", async () => {
  const source = await readFile(workflowPath, "utf8");
  const deploy = section(source, "  deploy:");

  assert.match(deploy, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/u);
  assert.match(deploy, /id: release-artifact/u);
  assert.match(deploy, /retention-days: 7/u);
  assert.doesNotMatch(source, /^\x20{2}publish-release:/m);
  assert.doesNotMatch(source, /publish:deployment-release/u);
});

test("cutover recovery can be finalized through the protected environment", async () => {
  const source = await readFile(workflowPath, "utf8");
  const trigger = section(source, "on:");
  const finalize = section(source, "  finalize:");
  assert.match(trigger, /finalize_operation:[\s\S]*?required: false[\s\S]*?type: string/m);
  assert.match(finalize, /needs: release-gate/u);
  assert.match(finalize, /needs\.release-gate\.outputs\.deploy == 'true' && inputs\.finalize_operation != ''/u);
  assert.match(finalize, /environment:\n\s+name: nemlig-production/u);
  assert.match(finalize, /permissions:\n\s+contents: write\n\s+actions: read/u);
  assert.match(finalize, /persist-credentials: false/u);
  assert.match(finalize, /pnpm install --frozen-lockfile/u);
  assert.match(finalize, /GH_TOKEN:/u);
  assert.match(finalize, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(finalize, /CLOUDFLARE_ACCOUNT_ID:/u);
  assert.match(finalize, /production:deploy -- finalize "\$FINALIZE_OPERATION" --evidence-saved --original-runner-stopped/u);
});

test("routine recovery finalizes only after its artifact is saved", async () => {
  const deploy = section(await readFile(workflowPath, "utf8"), "  deploy:");
  const upload = deploy.indexOf("uses: actions/upload-artifact@");
  const finalize = deploy.indexOf("production:deploy -- finalize");
  assert.ok(upload >= 0 && finalize > upload);
  assert.match(deploy, /if: \$\{\{ always\(\) && steps\.release-artifact\.outcome == 'success' && env\.CUTOVER != 'true' \}\}/u);
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
