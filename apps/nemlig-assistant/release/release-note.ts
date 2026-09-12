import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkVersionEligibility } from "./check-version-bump.js";
import { readReleaseChangedFiles } from "./agent.js";
import { parseVersion } from "./policy.js";
import { parseCodename, readPackageIdentity } from "../src/release-identity.js";

export const releaseNotesDirectory = "apps/nemlig-assistant/release/notes";
export const maximumReleaseNoteBytes = 8 * 1024;
export const maximumPlainLanguageBytes = 500;

export interface ReleaseNote {
  version: string;
  codename: string | null;
  path: string;
  body: string;
}

export interface ReleaseNoteValidation {
  eligible: false;
}

export interface EligibleReleaseNoteValidation extends ReleaseNote {
  eligible: true;
  codename: string;
}

export type ReleaseNoteCandidateValidation = ReleaseNoteValidation | EligibleReleaseNoteValidation;

function exactNotePath(version: string): string {
  parseVersion(version);
  return `${releaseNotesDirectory}/${version}.md`;
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Validates bounded, version-addressed Markdown independently of Git range handling. */
export function validateReleaseNote(version: string, codename: string | null, body: string): ReleaseNote {
  const notePath = exactNotePath(version);
  if (codename !== null) parseCodename(codename);
  const size = Buffer.byteLength(body, "utf8");
  if (size === 0) throw new Error(`Release note ${notePath} must not be empty.`);
  if (size > maximumReleaseNoteBytes) throw new Error(`Release note ${notePath} is too large (maximum ${maximumReleaseNoteBytes} bytes).`);
  if (body.includes("\u0000")) throw new Error(`Release note ${notePath} is not valid Markdown text.`);
  const heading = `# Nemlig Assistant ${version}${codename === null ? "" : ` - ${codename}`}`;
  const lines = body.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  if (lines[0] !== heading || !body.slice(heading.length).trim()) {
    throw new Error(`Release note ${notePath} must start with "${heading}" and contain Markdown content.`);
  }
  if (codename !== null) {
    if (lines[1] !== "" || lines[2] !== "## In plain language") {
      throw new Error(`Release note ${notePath} must begin with an "In plain language" section.`);
    }
    const remaining = lines.slice(3);
    const nextSection = remaining.findIndex((line) => line.startsWith("## "));
    const summary = (nextSection === -1 ? remaining : remaining.slice(0, nextSection)).join("\n").trim();
    if (!summary || Buffer.byteLength(summary, "utf8") > maximumPlainLanguageBytes) {
      throw new Error(`Release note ${notePath} must contain a plain language explanation of at most ${maximumPlainLanguageBytes} bytes.`);
    }
  }
  return { version, codename, path: notePath, body };
}

/** Reads the immutable note at an exact Git revision; callers still bind it to their own range or evidence. */
export function readReleaseNoteAtRef(repoRoot: string, ref: string, version: string, codename: string | null = null): ReleaseNote {
  const notePath = exactNotePath(version);
  let body: string;
  try {
    body = git(repoRoot, ["show", `${ref}:${notePath}`]);
  } catch {
    throw new Error(`Release note ${notePath} is missing at ${ref}.`);
  }
  return validateReleaseNote(version, codename, body);
}

/** Reuses the canonical exact-range release policy and changed-file reader. */
export function validateReleaseNoteCandidate(input: {
  repoRoot: string;
  baseRef: string;
  headRef?: string;
}): ReleaseNoteCandidateValidation {
  const headRef = input.headRef ?? "HEAD";
  const eligibility = checkVersionEligibility(input.repoRoot, input.baseRef, headRef);
  if (!eligibility.eligible) return { eligible: false };
  const manifest = git(input.repoRoot, ["show", `${headRef}:apps/nemlig-assistant/package.json`]);
  const identity = readPackageIdentity(manifest, `Nemlig package manifest at ${headRef}`);
  if (identity.codename === null) throw new Error("Release-bearing candidate is missing its codename.");
  const note = readReleaseNoteAtRef(input.repoRoot, headRef, eligibility.current, identity.codename);
  const changedFiles = readReleaseChangedFiles(input.repoRoot, input.baseRef, false, headRef);
  const notes = changedFiles.filter((filePath) => filePath.startsWith(`${releaseNotesDirectory}/`));
  if (notes.length !== 1 || notes[0] !== note.path) {
    throw new Error(`Release-bearing candidate must include exactly one target release note in its candidate diff: ${note.path}.`);
  }
  return { eligible: true, ...note, codename: identity.codename };
}

function parseCli(argv: readonly string[]): { baseRef: string; headRef: string; json: boolean } {
  if (argv[0] !== "--base" || !argv[1]) {
    throw new Error("Usage: release-note.ts --base <git-ref> [--head <git-ref>] [--json]");
  }
  let headRef = "HEAD";
  let json = false;
  for (let index = 2; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--head" && argv[index + 1]) headRef = argv[++index]!;
    else if (option === "--json") json = true;
    else throw new Error("Usage: release-note.ts --base <git-ref> [--head <git-ref>] [--json]");
  }
  return { baseRef: argv[1], headRef, json };
}

function main(): void {
  const options = parseCli(process.argv.slice(2));
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const result = validateReleaseNoteCandidate({ repoRoot, baseRef: options.baseRef, headRef: options.headRef });
  console.log(options.json ? JSON.stringify(result) : result.eligible ? `Nemlig release note: passed (${result.path}).` : "Nemlig release note: not applicable.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
