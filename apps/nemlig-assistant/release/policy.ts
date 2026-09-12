import { compare, valid } from "semver";
import { parseCodename, type PackageIdentity } from "../src/release-identity.js";

export type ReleaseKind = "none" | "patch" | "minor" | "major";
export type PublishKind = Exclude<ReleaseKind, "none">;
export { parseCodename, readPackageIdentity, type PackageIdentity } from "../src/release-identity.js";

export function parseCodenameLedger(contents: string | null): { version: string; codename: string }[] {
  if (contents === null) return [];
  const [header, ...rows] = contents.replace(/\n$/u, "").split("\n");
  if (header !== "version,codename") throw new Error("Invalid codename ledger header.");
  const versions = new Set<string>();
  const names = new Set<string>();
  return rows.map((row) => {
    const [version, codename, extra] = row.split(",");
    if (!version || !codename || extra !== undefined) throw new Error("Invalid codename ledger row.");
    parseVersion(version);
    if (versions.has(version) || names.has(codename.toLowerCase())) throw new Error("Codename ledger reuses a version or codename.");
    parseCodename(codename);
    versions.add(version);
    names.add(codename.toLowerCase());
    return { version, codename };
  });
}

export function validateCodenameLedger(base: string | null, current: string | null, identity: PackageIdentity, releaseBearing: boolean): void {
  const previous = parseCodenameLedger(base);
  const candidate = parseCodenameLedger(current);
  if (!releaseBearing) {
    if (base !== current) throw new Error("Non-release changes cannot change the codename ledger.");
    return;
  }
  if (!identity.codename) throw new Error("Candidate codename is missing from the ledger identity.");
  const expected = [...previous, identity];
  if (JSON.stringify(candidate) !== JSON.stringify(expected)) throw new Error("Codename ledger must append exactly the candidate version and codename.");
}

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

export interface ReleaseCommit {
  subject: string;
  body?: string;
}

export interface ReleaseDecision {
  kind: ReleaseKind;
  reason: string;
  releaseFiles: string[];
  internalFiles: string[];
}

export type RegistryState =
  | { status: "published"; version: string }
  | { status: "unpublished" }
  | { status: "unavailable"; reason: string };

export type TagState = "missing" | "matching" | "conflicting";

export interface TransactionDecision {
  action: "apply" | "no-op" | "reject";
  reason: string;
  versionAlreadyCurrent: boolean;
}

export interface RetryValidation {
  version: string;
  tag: string;
}

const strictPattern = /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/u;
const legacyPattern = /^(?<version>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-alpha\.(?:0|[1-9]\d*)$/u;
const order: Record<ReleaseKind, number> = { none: 0, patch: 1, minor: 2, major: 3 };

function parts(match: RegExpMatchArray): VersionParts {
  const groups = match.groups;
  if (!groups) throw new Error("Version parser did not return components.");
  return {
    major: Number(groups.major),
    minor: Number(groups.minor),
    patch: Number(groups.patch),
  };
}

export function parseVersion(version: string): VersionParts {
  const match = version.match(strictPattern);
  if (!match || match[0] !== version || !Object.values(parts(match)).every(Number.isSafeInteger)) {
    throw new Error(`Invalid Nemlig Assistant version "${version}". Expected plain major.minor.patch`);
  }
  return parts(match);
}

export function parseBaselineVersion(version: string): VersionParts {
  const legacy = version.match(legacyPattern);
  return parseVersion(legacy?.[0] === version ? legacy.groups!.version! : version);
}

export function formatVersion(version: VersionParts): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareParts(left: VersionParts, right: VersionParts): number {
  return left.major - right.major
    || left.minor - right.minor
    || left.patch - right.patch;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseBaselineVersion(right);
  return compareParts(leftParts, rightParts);
}

export function compareRegistryVersions(left: string, right: string): number {
  const normalizedLeft = valid(left);
  const normalizedRight = valid(right);
  if (!normalizedLeft || !normalizedRight) throw new Error(`Invalid npm version comparison: ${left} and ${right}`);
  return compare(normalizedLeft, normalizedRight);
}

export function assessVersionBump(previous: VersionParts, next: VersionParts): {
  ok: boolean;
  kind: Exclude<ReleaseKind, "none"> | null;
  reason: string;
} {
  if (compareParts(next, previous) <= 0) {
    return { ok: false, kind: null, reason: "Nemlig Assistant version must move forward." };
  }
  if (next.major > previous.major) {
    return next.minor === 0 && next.patch === 0
      ? { ok: true, kind: "major", reason: "Major bump accepted." }
      : { ok: false, kind: null, reason: "Major bumps must reset minor and patch to 0." };
  }
  if (next.major !== previous.major) {
    return { ok: false, kind: null, reason: "Major version cannot move backward." };
  }
  if (next.minor > previous.minor) {
    return next.patch === 0
      ? { ok: true, kind: "minor", reason: "Minor bump accepted." }
      : { ok: false, kind: null, reason: "Minor bumps must reset patch to 0." };
  }
  if (next.minor !== previous.minor) {
    return { ok: false, kind: null, reason: "Minor version cannot move backward." };
  }
  if (next.patch > previous.patch) return { ok: true, kind: "patch", reason: "Patch bump accepted." };
  return { ok: false, kind: null, reason: "Patch version cannot move backward." };
}

export function versionSatisfies(previous: string, next: string, required: ReleaseKind): boolean {
  if (required === "none") return previous === next;
  try {
    const assessment = assessVersionBump(parseBaselineVersion(previous), parseVersion(next));
    return assessment.ok && assessment.kind !== null && order[assessment.kind] >= order[required];
  } catch {
    return false;
  }
}

export function nextVersion(previous: string, current: string, kind: Exclude<ReleaseKind, "none">): string {
  if (versionSatisfies(previous, current, kind)) return current;
  const baseline = parseBaselineVersion(previous);
  const next = { ...baseline };
  if (kind === "major") {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
  } else if (kind === "minor") {
    next.minor += 1;
    next.patch = 0;
  } else if (kind === "patch") {
    next.patch += 1;
  }
  return formatVersion(next);
}

export function classifyPaths(changedFiles: readonly string[]): {
  releaseFiles: string[];
  internalFiles: string[];
} {
  const packagePrefix = "apps/nemlig-assistant/";
  const releaseFiles = changedFiles.filter((filePath) =>
    new RegExp(`^${packagePrefix}(?:package\\.json|tsdown\\.config\\.ts|src/(?!.*\\.test\\.ts$).+)$`, "u").test(filePath),
  );
  if (releaseFiles.length > 0 && changedFiles.includes("pnpm-lock.yaml")) releaseFiles.push("pnpm-lock.yaml");
  const internalFiles = changedFiles.filter((filePath) =>
    new RegExp(`^${packagePrefix}(?:release/|scripts/|src/.*\\.test\\.ts$|tsconfig\\.json$|eslint\\.config\\.mjs$)`, "u").test(filePath),
  );
  return { releaseFiles: [...new Set(releaseFiles)], internalFiles: [...new Set(internalFiles)] };
}

function commitType(subject: string): string | null {
  return subject.match(/^(?<type>[a-z]+)(?:\([^)]+\))?!?:/iu)?.groups?.type.toLowerCase() ?? null;
}

function isBreaking(commit: ReleaseCommit): boolean {
  return /^(?:[a-z]+)(?:\([^)]+\))?!:/iu.test(commit.subject)
    || /\bBREAKING CHANGE:/iu.test(commit.body ?? "");
}

export function decideRelease(input: {
  commits: readonly ReleaseCommit[];
  changedFiles: readonly string[];
  noRelease?: boolean;
}): ReleaseDecision {
  const classified = classifyPaths(input.changedFiles);
  const noRelease = input.noRelease
    || input.commits.some((commit) => /(?:^|\n)Nemlig-Release: none(?:\n|$)/iu.test(commit.body ?? ""));
  if (noRelease) return { kind: "none", reason: "The validated no-release override is set.", ...classified };
  if (classified.releaseFiles.length === 0) {
    return classified.internalFiles.length > 0
      ? { kind: "none", reason: "Only Nemlig tests or release internals changed.", ...classified }
      : { kind: "none", reason: "No Nemlig package files changed.", ...classified };
  }
  let kind: PublishKind = "patch";
  for (const commit of input.commits) {
    if (isBreaking(commit)) kind = "major";
    else if (kind !== "major" && commitType(commit.subject) === "feat") kind = "minor";
  }
  return {
    kind,
    reason: kind === "major"
      ? "A breaking-change marker changed the Nemlig package."
      : kind === "minor"
        ? "A feature commit changed the Nemlig package."
        : "The Nemlig package changed without a feature or breaking marker.",
    ...classified,
  };
}

export function decideTransaction(input: {
  candidateVersion: string;
  mainVersion: string | null;
  registry: RegistryState;
  tagState: TagState;
}): TransactionDecision {
  parseVersion(input.candidateVersion);
  if (input.tagState === "matching") {
    return { action: "no-op", reason: "The matching package tag already identifies this candidate.", versionAlreadyCurrent: true };
  }
  if (input.tagState === "conflicting") {
    return { action: "reject", reason: "The package tag exists on a different commit.", versionAlreadyCurrent: false };
  }
  if (input.mainVersion === null) {
    return { action: "reject", reason: "origin/main package version is unavailable.", versionAlreadyCurrent: false };
  }
  const mainComparison = compareVersions(input.candidateVersion, input.mainVersion);
  if (mainComparison < 0) {
    return { action: "reject", reason: `Candidate ${input.candidateVersion} is older than main ${input.mainVersion}.`, versionAlreadyCurrent: false };
  }
  if (input.registry.status === "unavailable") {
    return { action: "reject", reason: `npm registry state is unavailable: ${input.registry.reason}`, versionAlreadyCurrent: false };
  }
  if (
    input.registry.status === "published"
    && compareRegistryVersions(input.candidateVersion, input.registry.version) <= 0
  ) {
    return { action: "reject", reason: `Candidate ${input.candidateVersion} is not newer than npm ${input.registry.version}.`, versionAlreadyCurrent: false };
  }
  return {
    action: "apply",
    reason: input.registry.status === "unpublished"
      ? "The package is unpublished and the candidate is valid."
      : "The candidate is newer than main and npm.",
    versionAlreadyCurrent: mainComparison === 0,
  };
}

export function validateRetry(input: {
  tag: string;
  manifestVersion: string;
  tagExists: boolean;
  registry: RegistryState;
}): RetryValidation {
  const match = input.tag.match(/^nemlig-assistant-v(?<version>.+)$/u);
  if (!match?.groups?.version) throw new Error("Retry tag must use nemlig-assistant-v<version>.");
  const version = match.groups.version;
  parseVersion(version);
  if (!input.tagExists) throw new Error(`Retry tag ${input.tag} does not exist.`);
  if (version !== input.manifestVersion) {
    throw new Error(`Retry tag version ${version} does not match package version ${input.manifestVersion}.`);
  }
  if (input.registry.status === "unavailable") {
    throw new Error(`npm registry state is unavailable: ${input.registry.reason}`);
  }
  if (
    input.registry.status === "published"
    && compareRegistryVersions(version, input.registry.version) <= 0
  ) {
    throw new Error(`Retry version ${version} is already published or stale against npm ${input.registry.version}.`);
  }
  return { version, tag: input.tag };
}
