import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  packagePath,
  readCommits,
  readPackageVersionAtRef,
  readReleaseChangedFiles,
} from "./agent.js";
import { decideRelease, versionSatisfies, type ReleaseKind } from "./policy.js";

export interface VersionEligibility {
  eligible: boolean;
  kind: ReleaseKind;
  previous: string;
  current: string;
  reason: string;
}

/** Checks committed revisions only; missing or unrelated refs cannot become a docs-only pass. */
export function checkVersionEligibility(repoRoot: string, baseRef: string, headRef = "HEAD"): VersionEligibility {
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
    changedFiles: readReleaseChangedFiles(repoRoot, base, false, head),
  });
  if (decision.kind === "none") {
    return { eligible: false, kind: decision.kind, previous, current, reason: decision.reason };
  }
  if (!versionSatisfies(previous, current, decision.kind)) {
    throw new Error([
      `Nemlig ${decision.kind} changes require a forward major.minor.patch-alpha.increment version.`,
      `Previous: ${previous}`,
      `Current: ${current}`,
    ].join("\n"));
  }
  return {
    eligible: decision.releaseFiles.length > 0
      && (decision.kind === "patch" || decision.kind === "minor" || decision.kind === "major"),
    kind: decision.kind,
    previous,
    current,
    reason: decision.reason,
  };
}

export function checkVersionBump(repoRoot: string, baseRef: string, headRef = "HEAD"): string {
  const policy = checkVersionEligibility(repoRoot, baseRef, headRef);
  return versionCheckMessage(policy);
}

function versionCheckMessage(policy: VersionEligibility): string {
  if (policy.kind === "none") return "Nemlig version check: not applicable.";
  return `Nemlig version check: passed (${policy.previous} -> ${policy.current}, ${policy.kind}).`;
}

function main(): void {
  const [baseFlag, baseRef, ...options] = process.argv.slice(2);
  if (baseFlag !== "--base" || !baseRef) {
    throw new Error("Usage: check-version-bump.ts --base <git-ref> [--head <git-ref>] [--json]");
  }
  let headRef = "HEAD";
  let json = false;
  while (options.length > 0) {
    const option = options.shift();
    if (option === "--head" && options[0]) headRef = options.shift()!;
    else if (option === "--json") json = true;
    else throw new Error("Usage: check-version-bump.ts --base <git-ref> [--head <git-ref>] [--json]");
  }
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const policy = checkVersionEligibility(repoRoot, baseRef, headRef);
  console.log(json ? JSON.stringify(policy) : versionCheckMessage(policy));
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "check-version-bump.js") {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
