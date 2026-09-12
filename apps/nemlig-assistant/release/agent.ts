import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import {
  decideRelease,
  decideTransaction,
  nextVersion,
  nextCodename,
  parseVersion,
  readPackageIdentity,
  type PackageIdentity,
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
  baseCodename: string | null;
  currentVersion: string;
  currentCodename: string | null;
  mainRef: string;
  mainVersion: string | null;
  mainCodename: string | null;
  releaseKind: ReleaseDecision["kind"];
  reason: string;
  releaseFiles: string[];
  internalFiles: string[];
  targetVersion: string;
  targetCodename: string | null;
  targetTag: string;
  tagState: TagState;
  registry: RegistryState;
  transactionAction: "apply" | "no-op" | "reject";
  transactionReason: string;
  shouldRelease: boolean;
  versionValid: boolean;
  codenameValid: boolean;
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

export function readPackageIdentityAtRef(repoRoot: string, ref: string): PackageIdentity | null {
  const contents = gitMaybe(repoRoot, ["show", `${ref}:${packagePath}`]);
  return contents ? readPackageIdentity(contents, `${ref}:${packagePath}`) : null;
}

export function readWorkingVersion(repoRoot: string): string {
  return readPackageVersion(readFileSync(resolve(repoRoot, packagePath), "utf8"), packagePath);
}

export function readChangedFiles(repoRoot: string, baseRef: string, includeWorking = true, headRef = "HEAD"): string[] {
  const changed = lines(gitMaybe(repoRoot, ["diff", "--name-only", `${baseRef}...${headRef}`]));
  if (includeWorking) {
    changed.push(...lines(gitMaybe(repoRoot, ["diff", "--name-only", "HEAD"])));
    changed.push(...lines(gitMaybe(repoRoot, ["diff", "--cached", "--name-only", "HEAD"])));
  }
  return [...new Set(changed)];
}

function packageWithoutReleaseIdentity(contents: string): string {
  const manifest = JSON.parse(contents) as Record<string, unknown>;
  delete manifest.version;
  if (manifest.nemligRelease && typeof manifest.nemligRelease === "object" && !Array.isArray(manifest.nemligRelease)) {
    const metadata = manifest.nemligRelease as Record<string, unknown>;
    delete metadata.codename;
    if (Object.keys(metadata).length === 0) delete manifest.nemligRelease;
  }
  return JSON.stringify(manifest);
}

/** Excludes only the version/codename edit; callers validate its expected identity separately. */
export function readReleaseChangedFiles(repoRoot: string, baseRef: string, includeWorking = true, headRef = "HEAD"): string[] {
  const changed = readChangedFiles(repoRoot, baseRef, includeWorking, headRef);
  if (!changed.includes(packagePath)) return changed;
  const baseManifest = packageWithoutReleaseIdentity(git(repoRoot, ["show", `${baseRef}:${packagePath}`]));
  const currentManifest = packageWithoutReleaseIdentity(includeWorking
    ? readFileSync(resolve(repoRoot, packagePath), "utf8")
    : git(repoRoot, ["show", `${headRef}:${packagePath}`]));
  return baseManifest === currentManifest
    ? changed.filter((filePath) => filePath !== packagePath)
    : changed;
}

export function readCommits(repoRoot: string, baseRef: string, headRef = "HEAD"): ReleaseCommit[] {
  const output = gitMaybe(repoRoot, ["log", "--format=%s%x00%b%x1e", `${baseRef}..${headRef}`]);
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
  const base = readPackageIdentityAtRef(options.repoRoot, options.baseRef);
  if (base === null) throw new Error(`Cannot read Nemlig package version at ${options.baseRef}.`);
  const { version: baseVersion, codename: baseCodename } = base;
  const current = options.mergedCandidate
    ? readPackageIdentityAtRef(options.repoRoot, "HEAD")
    : readPackageIdentity(readFileSync(resolve(options.repoRoot, packagePath), "utf8"), packagePath);
  if (!current) throw new Error("Cannot read Nemlig candidate identity.");
  const { version: currentVersion, codename: currentCodename } = current;
  const release = decideRelease({
    commits: readCommits(options.repoRoot, options.baseRef),
    changedFiles: readReleaseChangedFiles(options.repoRoot, options.baseRef, !options.mergedCandidate),
    noRelease: options.noRelease,
  });
  const versionValid = versionSatisfies(baseVersion, currentVersion, release.kind);
  const releaseBearing = release.kind === "patch" || release.kind === "minor" || release.kind === "major";
  const targetCodename = releaseBearing ? nextCodename(baseCodename) : baseCodename;
  const codenameValid = currentCodename === targetCodename;
  const codenameConsistent = options.mergedCandidate
    ? codenameValid
    : currentCodename === baseCodename || (releaseBearing && codenameValid && versionValid && currentVersion !== baseVersion);
  const targetVersion = release.kind === "none"
    ? currentVersion
    : options.mergedCandidate
      ? currentVersion
      : nextVersion(baseVersion, currentVersion, release.kind);
  const targetTag = `nemlig-assistant-v${targetVersion}`;
  const tagState = readTagState(options.repoRoot, targetTag);
  const registry = releaseBearing
    ? options.registry ?? await fetchRegistryState()
    : { status: "unavailable" as const, reason: "Registry state is not required for a non-publish decision." };
  const mainRef = options.mainRef ?? "origin/main";
  const main = readPackageIdentityAtRef(options.repoRoot, mainRef);
  const mainVersion = main?.version ?? null;
  const mainCodename = main?.codename ?? null;
  const staleBaseline = releaseBearing && main && (options.mergedCandidate
    ? mainVersion !== currentVersion || mainCodename !== currentCodename
    : mainVersion !== baseVersion || mainCodename !== baseCodename);
  const transaction = !codenameConsistent
    ? { action: "reject" as const, reason: `Candidate codename must match ${targetCodename ?? "the unchanged historical identity"}.`, versionAlreadyCurrent: false }
    : staleBaseline
      ? { action: "reject" as const, reason: "Release baseline is stale relative to main identity.", versionAlreadyCurrent: false }
      : releaseBearing
        ? options.mergedCandidate && !versionValid
          ? { action: "reject" as const, reason: "Merged candidate does not satisfy its version policy.", versionAlreadyCurrent: false }
          : decideTransaction({ candidateVersion: targetVersion, mainVersion, registry, tagState })
        : { action: "no-op" as const, reason: "This change does not publish npm.", versionAlreadyCurrent: false };

  return {
    apply: options.apply ?? false,
    baseRef: options.baseRef,
    baseVersion,
    baseCodename,
    currentVersion,
    currentCodename,
    mainRef,
    mainVersion,
    mainCodename,
    releaseKind: release.kind,
    reason: release.reason,
    releaseFiles: release.releaseFiles,
    internalFiles: release.internalFiles,
    targetVersion,
    targetCodename,
    targetTag,
    tagState,
    registry,
    transactionAction: transaction.action,
    transactionReason: transaction.reason,
    shouldRelease: transaction.action === "apply"
      && (release.kind === "patch" || release.kind === "minor" || release.kind === "major"),
    versionValid,
    codenameValid,
  };
}

export function applyReleasePlan(repoRoot: string, plan: ReleasePlan): void {
  if (plan.transactionAction === "reject") throw new Error(plan.transactionReason);
  if (plan.releaseKind === "none") return;
  const manifestPath = resolve(repoRoot, packagePath);
  const contents = readFileSync(manifestPath, "utf8");
  const current = readPackageIdentity(contents, packagePath);
  const base = readPackageIdentityAtRef(repoRoot, plan.baseRef);
  const main = readPackageIdentityAtRef(repoRoot, plan.mainRef);
  if (base?.version !== plan.baseVersion || base?.codename !== plan.baseCodename
    || (main?.version ?? null) !== plan.mainVersion || (main?.codename ?? null) !== plan.mainCodename) {
    throw new Error("Release plan is stale; its base or main identity changed. Replan before apply.");
  }
  if (current.version === plan.targetVersion && current.codename === plan.targetCodename) return;
  if (current.version !== plan.currentVersion || current.codename !== plan.currentCodename) {
    throw new Error("Release plan is stale; the working manifest identity changed. Replan before apply.");
  }
  const manifest = JSON.parse(contents) as { version: string; nemligRelease?: { codename: string } };
  manifest.version = plan.targetVersion;
  if (plan.targetCodename !== null) manifest.nemligRelease = { ...manifest.nemligRelease, codename: plan.targetCodename };
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    renameSync(temporaryPath, manifestPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function writeGithubOutput(plan: ReleasePlan): void {
  if (!process.env.GITHUB_OUTPUT) return;
  writeFileSync(process.env.GITHUB_OUTPUT, [
    `should_release=${plan.shouldRelease ? "true" : "false"}`,
    `target_version=${plan.targetVersion}`,
    `target_codename=${plan.targetCodename ?? ""}`,
    `target_tag=${plan.targetTag}`,
    `transaction_action=${plan.transactionAction}`,
  ].join("\n") + "\n", { flag: "a" });
}

/** Parse release options without performing planning, I/O, or process termination. */
export function parseArgs(argv: string[]): Omit<PlanOptions, "repoRoot"> {
  const ref = (value: string): string => {
    if (!value || value.startsWith("-")) throw new Error("Git refs must be non-empty and must not be options.");
    return value;
  };
  const command = new Command()
    .name("release-agent")
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    .helpOption(false)
    .addOption(new Option("--base <ref>", "base Git ref").default("origin/main").argParser(ref))
    .addOption(new Option("--main-ref <ref>", "main Git ref").argParser(ref))
    .option("--apply", "apply the planned version update")
    .option("--merged-candidate", "evaluate a merged candidate")
    .option("--no-release", "suppress release publication");
  command.parse(["node", "release-agent", ...argv], { from: "node" });
  const parsed = command.opts<{
    base: string;
    mainRef?: string;
    apply?: boolean;
    mergedCandidate?: boolean;
    release?: boolean;
  }>();
  return {
    baseRef: parsed.base,
    ...(parsed.mainRef === undefined ? {} : { mainRef: parsed.mainRef }),
    ...(parsed.apply === undefined ? {} : { apply: parsed.apply }),
    ...(parsed.mergedCandidate === undefined ? {} : { mergedCandidate: parsed.mergedCandidate }),
    ...(parsed.release === false ? { noRelease: true } : {}),
  };
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
