import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  packagePath,
  readChangedFiles,
  readCommits,
  readPackageVersionAtRef,
  readWorkingVersion,
} from "./agent.js";
import { decideRelease, versionSatisfies } from "./policy.js";

export function checkVersionBump(repoRoot: string, baseRef: string): string {
  const previous = readPackageVersionAtRef(repoRoot, baseRef);
  if (previous === null) throw new Error(`Cannot read ${packagePath} at ${baseRef}.`);
  const current = readWorkingVersion(repoRoot);
  const decision = decideRelease({
    commits: readCommits(repoRoot, baseRef),
    changedFiles: readChangedFiles(repoRoot, baseRef, false),
  });
  if (decision.kind === "none") return "Nemlig version check: not applicable.";
  if (!versionSatisfies(previous, current, decision.kind)) {
    throw new Error([
      `Nemlig ${decision.kind} changes require a forward major.minor.patch-alpha.increment version.`,
      `Previous: ${previous}`,
      `Current: ${current}`,
    ].join("\n"));
  }
  return `Nemlig version check: passed (${previous} -> ${current}, ${decision.kind}).`;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--base") throw new Error("Usage: check-version-bump.ts --base <git-ref>");
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  console.log(checkVersionBump(repoRoot, args[1]));
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "check-version-bump.js") {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
