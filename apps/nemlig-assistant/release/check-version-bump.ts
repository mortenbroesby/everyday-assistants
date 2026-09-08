import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  packagePath,
  readChangedFiles,
  readCommits,
  readPackageVersionAtRef,
} from "./agent.js";
import { decideRelease, versionSatisfies } from "./policy.js";

/** Checks committed revisions only; missing or unrelated refs cannot become a docs-only pass. */
export function checkVersionBump(repoRoot: string, baseRef: string, headRef = "HEAD"): string {
  const commit = (ref: string): string => {
    try {
      return execFileSync("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch { throw new Error(`Cannot resolve Git revision ${ref}.`); }
  };
  const base = commit(baseRef);
  const head = commit(headRef);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, head], { cwd: repoRoot, stdio: "ignore" });
  } catch { throw new Error("Version comparison base must be an ancestor of head."); }
  const previous = readPackageVersionAtRef(repoRoot, base);
  if (previous === null) throw new Error(`Cannot read ${packagePath} at ${baseRef}.`);
  const current = readPackageVersionAtRef(repoRoot, head);
  if (current === null) throw new Error(`Cannot read ${packagePath} at ${headRef}.`);
  const decision = decideRelease({
    commits: readCommits(repoRoot, base, head),
    changedFiles: readChangedFiles(repoRoot, base, false, head),
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
  if ((args.length !== 2 && args.length !== 4) || args[0] !== "--base" || (args.length === 4 && args[2] !== "--head")) {
    throw new Error("Usage: check-version-bump.ts --base <git-ref> [--head <git-ref>]");
  }
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  console.log(checkVersionBump(repoRoot, args[1], args[3] ?? "HEAD"));
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "check-version-bump.js") {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
