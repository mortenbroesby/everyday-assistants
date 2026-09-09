import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../../../.github/workflows/nemlig-production.yml", import.meta.url);

const section = (source: string, heading: string): string => {
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing workflow section: ${heading}`);
  const rest = source.slice(start + heading.length + 1);
  const next = rest.search(/^\S/m);
  return next === -1 ? rest : rest.slice(0, next);
};

test("production workflow is manual, main-only, protected, and credential-scoped", async () => {
  const source = await readFile(workflowPath, "utf8");
  const trigger = section(source, "on:");
  assert.match(trigger, /^\x20{2}workflow_dispatch:\n/m);
  assert.doesNotMatch(trigger, /^\x20{2}(?:push|pull_request|schedule|workflow_call):/m);
  assert.match(trigger, /commit:\n\s+description:.*commit/m);
  assert.match(trigger, /commit:[\s\S]*?required: true[\s\S]*?type: string/m);
  assert.match(trigger, /cutover:[\s\S]*?default: false[\s\S]*?type: boolean/m);
  assert.match(source, /^concurrency:\n\x20{2}group: nemlig-production\n\x20{2}cancel-in-progress: false$/m);

  const preflight = section(source, "  preflight:");
  const deploy = section(source, "  deploy:");
  assert.match(preflight, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(preflight, /timeout-minutes: 30/u);
  assert.match(preflight, /permissions:\n\s+contents: read\n\s+actions: read/u);
  assert.match(preflight, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(preflight, /persist-credentials: false/u);
  assert.match(preflight, /pnpm install --frozen-lockfile/u);
  assert.match(preflight, /production:deploy -- preflight "\$CANDIDATE_SHA"/u);
  assert.match(preflight, /env:\n\s+GH_TOKEN:/u);

  assert.match(deploy, /needs: preflight/u);
  assert.match(deploy, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.doesNotMatch(deploy, /inputs\./u);
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
  assert.match(deploy, /\.git\/nemlig-production-deploy\/latest\.json/u);
  assert.match(deploy, /actions\/upload-artifact@[0-9a-f]{40}/u);
  assert.match(deploy, /id: release-artifact/u);
  assert.match(deploy, /retention-days: 7/u);
  assert.match(deploy, /include-hidden-files: true/u);
  assert.doesNotMatch(source, /setup-.*provider|activate|cloudflare\/workers/u);
});

test("routine recovery finalizes only after its artifact is saved", async () => {
  const deploy = section(await readFile(workflowPath, "utf8"), "  deploy:");
  const upload = deploy.indexOf("uses: actions/upload-artifact@");
  const finalize = deploy.indexOf("production:deploy -- finalize");
  assert.ok(upload >= 0 && finalize > upload);
  assert.match(deploy, /if: \$\{\{ always\(\) && steps\.release-artifact\.outcome == 'success' && env\.CUTOVER != 'true' \}\}/u);
  assert.match(deploy, /JSON\.parse\(readFileSync\(process\.argv\[1\], "utf8"\)\)/u);
  assert.match(deploy, /\^\[0-9a-f\]\{8\}\(\?:-\[0-9a-f\]\{4\}\)\{3\}-\[0-9a-f\]\{12\}\$/u);
  assert.match(deploy, /finalize "\$operation_id" --evidence-saved --original-runner-stopped/u);

  const finalization = deploy.slice(deploy.lastIndexOf("      - name:", finalize));
  assert.match(finalization, /GH_TOKEN:/u);
  assert.match(finalization, /CLOUDFLARE_API_TOKEN:/u);
  assert.match(finalization, /CLOUDFLARE_ACCOUNT_ID:/u);
  assert.doesNotMatch(finalization, /NEMLIG_MCP_SERVICE_CLIENT_SECRET/u);
});
