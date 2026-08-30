import { execFileSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { fetchRegistryState, readWorkingVersion } from "./agent.js";
import { validateRetry } from "./policy.js";

function tagExists(repoRoot: string, tag: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--tag") throw new Error("Usage: retry.ts --tag <existing-tag>");
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = validateRetry({
    tag: args[1],
    manifestVersion: readWorkingVersion(repoRoot),
    tagExists: tagExists(repoRoot, args[1]),
    registry: await fetchRegistryState(),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "retry.js") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
