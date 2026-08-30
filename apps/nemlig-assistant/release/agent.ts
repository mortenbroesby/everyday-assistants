import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  decideRelease,
  decideTransaction,
  nextVersion,
  parseVersion,
  type RegistryState,
  type ReleaseCommit,
  type ReleaseDecision,
  type TagState,
  versionSatisfies,
} from "./policy.js";

export interface ReleasePlan {
  apply: boolean;
  baseRef: string;
  baseVersion: string;
  currentVersion: string;
  mainVersion: string | null;
  releaseKind: ReleaseDecision["kind"];
  reason: string;
  releaseFiles: string[];
  internalFiles: string[];
  targetVersion: string;
  targetTag: string;
  tagState: TagState;
  registry: RegistryState;
  transactionAction: "apply" | "no-op" | "reject";
  transactionReason: string;
  shouldRelease: boolean;
  versionValid: boolean;
}

export interface PlanOptions {
  repoRoot: string;
  baseRef: string;
  mainRef?: string;
  apply?: boolean;
  mergedCandidate?: boolean;
  noRelease?: boolean;
  registry?: RegistryState;
}

export const packagePath = "apps/nemlig-assistant/package.json";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitMaybe(repoRoot: string, args: readonly string[]): string {
  try {
    return git(repoRoot, args);
  } catch {
    return "";
  }
}

function lines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function readPackageVersion(contents: string, label: string): string {
  const parsed = JSON.parse(contents) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${label} is missing a version string.`);
  }
  return parsed.version;
}

export function readPackageVersionAtRef(repoRoot: string, ref: string): string | null {
  try {
    return readPackageVersion(git(repoRoot, ["show", `${ref}:${packagePath}`]), `${ref}:${packagePath}`);
  } catch {
    return null;
  }
}

export function readWorkingVersion(repoRoot: string): string {
  return readPackageVersion(readFileSync(resolve(repoRoot, packagePath), "utf8"), packagePath);
}

export function readChangedFiles(repoRoot: string, baseRef: string, includeWorking = true): string[] {
  const changed = lines(gitMaybe(repoRoot, ["diff", "--name-only", `${baseRef}...HEAD`]));
  if (includeWorking) {
    changed.push(...lines(gitMaybe(repoRoot, ["diff", "--name-only", "HEAD"])));
    changed.push(...lines(gitMaybe(repoRoot, ["diff", "--cached", "--name-only", "HEAD"])));
  }
  return [...new Set(changed)];
}

export function readCommits(repoRoot: string, baseRef: string): ReleaseCommit[] {
  const output = gitMaybe(repoRoot, ["log", "--format=%s%x00%b%x1e", `${baseRef}..HEAD`]);
  return output.split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [subject = "", body = ""] = entry.split("\x00");
    return { subject, body };
  });
}

export async function fetchRegistryState(): Promise<RegistryState> {
  try {
    const response = await fetch("https://registry.npmjs.org/nemlig-assistant", {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return { status: "unpublished" };
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    const metadata = await response.json() as { "dist-tags"?: { latest?: unknown } };
    const version = metadata["dist-tags"]?.latest;
    if (typeof version !== "string") return { status: "unavailable", reason: "missing latest dist-tag" };
    parseVersion(version);
    return { status: "published", version };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

function readTagState(repoRoot: string, tag: string): TagState {
  const tagged = gitMaybe(repoRoot, ["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]);
  if (!tagged) return "missing";
  return tagged === git(repoRoot, ["rev-parse", "HEAD"]) ? "matching" : "conflicting";
}

export async function createReleasePlan(options: PlanOptions): Promise<ReleasePlan> {
  const baseVersion = readPackageVersionAtRef(options.repoRoot, options.baseRef);
  if (baseVersion === null) throw new Error(`Cannot read Nemlig package version at ${options.baseRef}.`);
  const currentVersion = readWorkingVersion(options.repoRoot);
  const release = decideRelease({
    commits: readCommits(options.repoRoot, options.baseRef),
    changedFiles: readChangedFiles(options.repoRoot, options.baseRef, !options.mergedCandidate),
    noRelease: options.noRelease,
  });
  const versionValid = versionSatisfies(baseVersion, currentVersion, release.kind);
  const targetVersion = release.kind === "none"
    ? currentVersion
    : options.mergedCandidate
      ? currentVersion
      : nextVersion(baseVersion, currentVersion, release.kind);
  const targetTag = `nemlig-assistant-v${targetVersion}`;
  const tagState = readTagState(options.repoRoot, targetTag);
  const registry = release.kind === "patch" || release.kind === "minor" || release.kind === "major"
    ? options.registry ?? await fetchRegistryState()
    : { status: "unavailable" as const, reason: "Registry state is not required for a non-publish decision." };
  const mainVersion = readPackageVersionAtRef(options.repoRoot, options.mainRef ?? "origin/main");
  const transaction = release.kind === "patch" || release.kind === "minor" || release.kind === "major"
    ? options.mergedCandidate && !versionValid
      ? { action: "reject" as const, reason: "Merged candidate does not satisfy its version policy.", versionAlreadyCurrent: false }
      : decideTransaction({ candidateVersion: targetVersion, mainVersion, registry, tagState })
    : { action: "no-op" as const, reason: "This change does not publish npm.", versionAlreadyCurrent: false };

  return {
    apply: options.apply ?? false,
    baseRef: options.baseRef,
    baseVersion,
    currentVersion,
    mainVersion,
    releaseKind: release.kind,
    reason: release.reason,
    releaseFiles: release.releaseFiles,
    internalFiles: release.internalFiles,
    targetVersion,
    targetTag,
    tagState,
    registry,
    transactionAction: transaction.action,
    transactionReason: transaction.reason,
    shouldRelease: transaction.action === "apply"
      && (release.kind === "patch" || release.kind === "minor" || release.kind === "major"),
    versionValid,
  };
}

export function applyReleasePlan(repoRoot: string, plan: ReleasePlan): void {
  if (plan.transactionAction === "reject") throw new Error(plan.transactionReason);
  if (plan.releaseKind === "none" || plan.targetVersion === plan.currentVersion) return;
  const manifestPath = resolve(repoRoot, packagePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: string };
  manifest.version = plan.targetVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeGithubOutput(plan: ReleasePlan): void {
  if (!process.env.GITHUB_OUTPUT) return;
  writeFileSync(process.env.GITHUB_OUTPUT, [
    `should_release=${plan.shouldRelease ? "true" : "false"}`,
    `target_version=${plan.targetVersion}`,
    `target_tag=${plan.targetTag}`,
    `transaction_action=${plan.transactionAction}`,
  ].join("\n") + "\n", { flag: "a" });
}

function parseArgs(argv: string[]): Omit<PlanOptions, "repoRoot"> {
  const options: Omit<PlanOptions, "repoRoot"> = { baseRef: "origin/main" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--merged-candidate") options.mergedCandidate = true;
    else if (argument === "--no-release") options.noRelease = true;
    else if (argument === "--base" && argv[index + 1]) options.baseRef = argv[++index];
    else if (argument === "--main-ref" && argv[index + 1]) options.mainRef = argv[++index];
    else throw new Error(`Unknown release argument: ${argument}`);
  }
  return options;
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const options = parseArgs(process.argv.slice(2));
  const plan = await createReleasePlan({ repoRoot, ...options });
  if (options.apply) applyReleasePlan(repoRoot, plan);
  writeGithubOutput(plan);
  console.log(JSON.stringify(plan, null, 2));
  if ((options.apply || options.mergedCandidate) && plan.transactionAction === "reject") {
    throw new Error(plan.transactionReason);
  }
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "agent.js") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
