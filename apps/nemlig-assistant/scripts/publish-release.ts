import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseVersion } from "../release/policy.js";
import { readReleaseNoteAtRef, validateReleaseNote } from "../release/release-note.js";
import { parseDeploymentJournal, type DeploymentJournal } from "./production-deploy.js";

const fullSha = /^[0-9a-f]{40}$/u;
const repositoryName = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export interface GitHubReleaseClient {
  getTag(tag: string): Promise<{ sha: string; type: string } | undefined>;
  createTag(tag: string, target: string): Promise<void>;
  getRelease(tag: string): Promise<Record<string, unknown> | undefined>;
  createRelease(input: { tag: string; target: string; name: string; body: string; prerelease: boolean }): Promise<void>;
}

export interface PublicationEvidence {
  candidate: string;
  expectedRunId: number;
}

export interface PublicationResult {
  action: "published" | "no-op";
  tag: string;
  body: string;
}

function requireSha(value: string, label: string): void {
  if (!fullSha.test(value)) throw new Error(`${label} must be a 40-character lowercase commit SHA.`);
}

/** Validates a parsed schema-2 journal before any GitHub mutation is considered. */
export function validatePublicationJournal(raw: string, evidence: PublicationEvidence): DeploymentJournal {
  requireSha(evidence.candidate, "Candidate");
  if (!Number.isSafeInteger(evidence.expectedRunId) || evidence.expectedRunId < 1) {
    throw new Error("Expected GitHub workflow run ID must be a positive integer.");
  }
  const journal = parseDeploymentJournal(raw);
  if (journal.commit !== evidence.candidate) throw new Error("Deployment journal commit does not match the exact candidate.");
  if (journal.releaseRunId !== evidence.expectedRunId) throw new Error("Deployment journal was not produced by this GitHub workflow run.");
  if (journal.outcome !== "success" || journal.lastVerifiedState !== "enabled" || !journal.completedAt) {
    throw new Error("Deployment journal does not record a completed successful enabled deployment.");
  }
  const checks = new Set(journal.checks);
  if (!checks.has("edge_acceptance") || !checks.has("service_fixture_acceptance") || checks.has("live_acceptance_pending")) {
    throw new Error("Deployment journal is missing routine acceptance evidence or still has live acceptance pending.");
  }
  return journal;
}

export function releaseTag(version: string): string {
  parseVersion(version);
  return `nemlig-assistant-v${version}`;
}

/** The source note stays readable while the machine links stay stable across retries. */
export function releaseBody(note: string, repository: string, candidate: string, journal: Pick<DeploymentJournal, "ciRunId" | "releaseRunId">): string {
  if (!repositoryName.test(repository)) throw new Error("GitHub repository must use owner/name.");
  requireSha(candidate, "Candidate");
  if (journal.releaseRunId === "local") throw new Error("A local deployment journal cannot publish a GitHub prerelease.");
  return `${note.trimEnd()}\n\n---\n\n[Commit](https://github.com/${repository}/commit/${candidate}) · [CI run](https://github.com/${repository}/actions/runs/${journal.ciRunId}) · [Deployment run](https://github.com/${repository}/actions/runs/${journal.releaseRunId})\n`;
}

function releaseMatches(release: Record<string, unknown>, expected: { tag: string; target: string; body: string }): boolean {
  return release.tag_name === expected.tag
    && release.target_commitish === expected.target
    && release.name === expected.tag
    && release.body === expected.body
    && release.prerelease === true
    && release.draft === false;
}

async function reconcileTag(client: GitHubReleaseClient, tag: string, candidate: string): Promise<boolean> {
  const existing = await client.getTag(tag);
  if (existing) {
    if (existing.type !== "commit" || existing.sha !== candidate) throw new Error(`GitHub tag ${tag} exists on a different commit.`);
    return false;
  }
  try {
    await client.createTag(tag, candidate);
  } catch (error) {
    const readback = await client.getTag(tag);
    if (!readback || readback.type !== "commit" || readback.sha !== candidate) throw error;
  }
  const readback = await client.getTag(tag);
  if (!readback || readback.type !== "commit" || readback.sha !== candidate) {
    throw new Error(`GitHub tag ${tag} could not be reconciled to the exact candidate.`);
  }
  return true;
}

/** Creates only missing matching state, and reads it back after every possible partial write. */
export async function publishGitHubPrerelease(input: {
  client: GitHubReleaseClient;
  repository: string;
  candidate: string;
  version: string;
  note: string;
  journal: string;
  expectedRunId: number;
}): Promise<PublicationResult> {
  const journal = validatePublicationJournal(input.journal, { candidate: input.candidate, expectedRunId: input.expectedRunId });
  const checkedNote = validateReleaseNote(input.version, input.note);
  const tag = releaseTag(input.version);
  const body = releaseBody(checkedNote.body, input.repository, input.candidate, journal);
  await reconcileTag(input.client, tag, input.candidate);
  const existing = await input.client.getRelease(tag);
  if (existing) {
    if (!releaseMatches(existing, { tag, target: input.candidate, body })) throw new Error(`GitHub prerelease ${tag} conflicts with the committed release evidence.`);
    return { action: "no-op", tag, body };
  }
  try {
    await input.client.createRelease({ tag, target: input.candidate, name: tag, body, prerelease: true });
  } catch (error) {
    const readback = await input.client.getRelease(tag);
    if (!readback || !releaseMatches(readback, { tag, target: input.candidate, body })) throw error;
  }
  const readback = await input.client.getRelease(tag);
  if (!readback || !releaseMatches(readback, { tag, target: input.candidate, body })) {
    throw new Error(`GitHub prerelease ${tag} could not be reconciled to the committed release evidence.`);
  }
  return { action: "published", tag, body };
}

class GhApiError extends Error {
  constructor(readonly status: number | undefined, message: string) { super(message); }
}

function ghJson(args: readonly string[]): Record<string, unknown> | undefined {
  try {
    const output = execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const value: unknown = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub API returned a non-object response.");
    return value as Record<string, unknown>;
  } catch (error) {
    const caught = error as { message?: unknown; stderr?: unknown };
    const stderrValue = caught.stderr;
    const stderr = typeof stderrValue === "string"
      ? stderrValue
      : Buffer.isBuffer(stderrValue) ? (stderrValue as Buffer).toString() : "";
    const detail = `${typeof caught.message === "string" ? caught.message : String(error)}\n${stderr}`;
    if (/HTTP 404|Not Found/iu.test(detail)) return undefined;
    throw new GhApiError(undefined, detail);
  }
}

function ghClient(repository: string): GitHubReleaseClient {
  const endpoint = (path: string): string => `repos/${repository}/${path}`;
  return {
    async getTag(tag) {
      const value = ghJson(["--method", "GET", endpoint(`git/ref/tags/${tag}`)]);
      if (!value) return undefined;
      const object = value.object;
      if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("GitHub tag response is invalid.");
      const sha = (object as Record<string, unknown>).sha;
      const type = (object as Record<string, unknown>).type;
      if (typeof sha !== "string" || typeof type !== "string") throw new Error("GitHub tag response is invalid.");
      return { sha, type };
    },
    async createTag(tag, target) {
      ghJson(["--method", "POST", endpoint("git/refs"), "--raw-field", `ref=refs/tags/${tag}`, "--raw-field", `sha=${target}`]);
    },
    async getRelease(tag) { return ghJson(["--method", "GET", endpoint(`releases/tags/${tag}`)]); },
    async createRelease(input) {
      ghJson([
        "--method", "POST", endpoint("releases"),
        "--raw-field", `tag_name=${input.tag}`,
        "--raw-field", `target_commitish=${input.target}`,
        "--raw-field", `name=${input.name}`,
        "--raw-field", `body=${input.body}`,
        "--field", "prerelease=true",
        "--field", "draft=false",
        "--field", "generate_release_notes=false",
      ]);
    },
  };
}

function parseCli(argv: readonly string[]): { journalPath: string; candidate: string; repository: string } {
  let journalPath: string | undefined;
  let candidate: string | undefined;
  let repository: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if ((option === "--journal" || option === "--candidate" || option === "--repository") && value) {
      if (option === "--journal") journalPath = value;
      if (option === "--candidate") candidate = value;
      if (option === "--repository") repository = value;
      index += 1;
    } else throw new Error("Usage: publish-release.ts --journal <path> --candidate <sha> --repository <owner/name>");
  }
  if (!journalPath || !candidate || !repository) throw new Error("Usage: publish-release.ts --journal <path> --candidate <sha> --repository <owner/name>");
  return { journalPath, candidate, repository };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const expectedRunId = Number(process.env.GITHUB_RUN_ID);
  if (!Number.isSafeInteger(expectedRunId) || expectedRunId < 1) throw new Error("GITHUB_RUN_ID must be a positive integer.");
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const version = JSON.parse(readFileSync(resolve(repoRoot, "apps/nemlig-assistant/package.json"), "utf8")) as { version?: unknown };
  if (typeof version.version !== "string") throw new Error("Nemlig package manifest is missing a version.");
  const note = readReleaseNoteAtRef(repoRoot, options.candidate, version.version);
  const result = await publishGitHubPrerelease({
    client: ghClient(options.repository), repository: options.repository, candidate: options.candidate,
    version: version.version, note: note.body, journal: readFileSync(options.journalPath, "utf8"), expectedRunId,
  });
  console.log(JSON.stringify({ action: result.action, tag: result.tag }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
