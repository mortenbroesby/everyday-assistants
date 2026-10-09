import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL(
  "../../../.github/workflows/nemlig-production.yml",
  import.meta.url,
);
const deployScriptPath = new URL(
  "../scripts/production-deploy.ts",
  import.meta.url,
);
const packagePath = new URL("../package.json", import.meta.url);

test("production workflow deploys only the current successful main CI candidate", async () => {
  const source = await readFile(workflowPath, "utf8");
  const releaseGate = source.slice(
    source.indexOf("  release-gate:"),
    source.indexOf("\n  deploy:"),
  );
  assert.match(
    source,
    /^\x20{2}workflow_run:\n\x20{4}workflows: \[CI\]\n\x20{4}types: \[completed\]/m,
  );
  assert.match(
    source,
    /^concurrency:\n\x20{2}group: nemlig-production\n\x20{2}cancel-in-progress: false\n\x20{2}queue: max$/m,
  );
  assert.match(source, /workflow_run\.conclusion == 'success'/u);
  assert.match(source, /workflow_run\.event == 'push'/u);
  assert.match(source, /workflow_run\.head_branch == 'main'/u);
  assert.match(
    releaseGate,
    /CURRENT_MAIN_SHA="\$\(git rev-parse origin\/main\)"/u,
  );
  assert.match(
    releaseGate,
    /if \[\[ "\$CANDIDATE_SHA" != "\$CURRENT_MAIN_SHA" \]\]; then[\s\S]*?Skipping superseded CI candidate[\s\S]*?deploy=false/u,
  );
  assert.doesNotMatch(
    releaseGate,
    /git merge-base --is-ancestor "\$CANDIDATE_SHA" origin\/main/u,
  );
  assert.match(source, /echo "deploy=true" >> "\$GITHUB_OUTPUT"/u);
  assert.match(
    source,
    /deploy:\n\s+needs: release-gate\n\s+if: needs\.release-gate\.outputs\.deploy == 'true'/u,
  );
  assert.doesNotMatch(source, /workflow_dispatch|schedule:|pull_request:/u);
});

test("production job builds and deploys the exact protected candidate", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /environment:\n\s+name: nemlig-production/u);
  assert.match(source, /git checkout --detach "\$CANDIDATE_SHA"/u);
  assert.match(source, /node-version: 24\.13\.0/u);
  assert.match(source, /version: 9\.15\.9/u);
  assert.match(source, /run: pnpm --filter nemlig-assistant build/u);
  assert.match(source, /wrangler deployments list --env production/u);
  assert.match(source, /wrangler containers list --env production/u);
  assert.match(source, /production:deploy -- --service "\$CANDIDATE_SHA"/u);
});

test("release tooling has no lease, journal, recovery, or retention path", async () => {
  const [workflow, deploy, packageJson] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(deployScriptPath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);
  assert.doesNotMatch(
    workflow,
    /\blease\b|journal|recovery|reconcile|retention|rollback|upload-artifact|download-artifact/iu,
  );
  assert.doesNotMatch(
    deploy,
    /\blease\b|journal|recovery|reconcile|retention|rollback/iu,
  );
  assert.doesNotMatch(packageJson, /production:retention/u);
});
