import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { NemligError } from "./client.js";

const execute = promisify(execFile);
const repository = "mortenbroesby/everyday-assistants";
const githubTimeoutMs = 30_000;

export interface FeatureRequest {
  title: string;
  summary: string;
  acceptance_criteria?: string[];
  context?: string;
}

export interface FeatureRequestResult {
  number: number;
  title: string;
  url: string;
}

type GhRunner = (args: string[]) => Promise<string>;

const runGh: GhRunner = async (args) => {
  try {
    const { stdout } = await execute("gh", args, { encoding: "utf8", timeout: githubTimeoutMs });
    return stdout;
  } catch (error) {
    if (error instanceof Error && "killed" in error && error.killed) {
      throw new NemligError("GitHub timed out. Retry the same feature request; matching retries are safe.");
    }
    throw error;
  }
};

const clean = (value: string, name: string, maximum: number): string => {
  const result = value.trim();
  if (!result) throw new NemligError(`${name} is required.`);
  if (result.length > maximum) throw new NemligError(`${name} must be at most ${maximum} characters.`);
  return result;
};

export const featureRequestBody = (request: FeatureRequest): string => {
  const summary = clean(request.summary, "Summary", 2_000);
  if ((request.acceptance_criteria?.length ?? 0) > 10) {
    throw new NemligError("At most 10 acceptance criteria are allowed.");
  }
  const criteria = (request.acceptance_criteria ?? []).map((item) => clean(item, "Acceptance criterion", 300));
  const context = request.context?.trim();
  return [
    "## Summary",
    "",
    summary,
    "",
    "## Acceptance criteria",
    "",
    ...(criteria.length ? criteria.map((item) => `- [ ] ${item}`) : ["- [ ] Implement and verify the requested behavior."]),
    ...(context ? ["", "## Context", "", clean(context, "Context", 1_000)] : []),
    "",
    "_Captured by Nemlig Assistant._",
  ].join("\n");
};

const issueUrl = (output: string): string | undefined =>
  output.trim().split(/\s+/u).find((value) => /^https:\/\/github\.com\/mortenbroesby\/everyday-assistants\/issues\/\d+$/u.test(value));

const resultFromUrl = (title: string, url: string): FeatureRequestResult => ({
  number: Number(url.slice(url.lastIndexOf("/") + 1)),
  title,
  url,
});

export const featureRequestMarker = (request: FeatureRequest): string => {
  const title = clean(request.title, "Title", 120);
  return `<!-- nemlig-feature-request:${createHash("sha256").update(`${title}\n${featureRequestBody(request)}`).digest("hex")} -->`;
};

const findExisting = async (
  runner: GhRunner,
  marker: string,
  title: string,
  baseBody: string,
): Promise<FeatureRequestResult | undefined> => {
  const output = await runner([
    "issue",
    "list",
    "--repo",
    repository,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "body,title,url",
  ]);
  let issues: unknown;
  try {
    issues = JSON.parse(output) as unknown;
  } catch {
    throw new NemligError("GitHub returned an invalid feature-request lookup response.");
  }
  if (!Array.isArray(issues)) {
    throw new NemligError("GitHub returned an invalid feature-request lookup response.");
  }
  // ponytail: scan the newest 100 issues; move to a server-side idempotency store if this repository outgrows that window.
  const match = issues.find(
    (issue): issue is { body: string; title: string; url: string } =>
      typeof issue === "object" &&
      issue !== null &&
      "body" in issue &&
      typeof issue.body === "string" &&
      "title" in issue &&
      typeof issue.title === "string" &&
      (issue.body.includes(marker) || (issue.title === title && issue.body === baseBody)) &&
      "url" in issue &&
      typeof issue.url === "string",
  );
  const url = match?.url;
  return url && issueUrl(url) ? resultFromUrl(title, url) : undefined;
};

export async function createFeatureRequest(
  request: FeatureRequest,
  runner: GhRunner = runGh,
): Promise<FeatureRequestResult> {
  const title = clean(request.title, "Title", 120);
  const baseBody = featureRequestBody(request);
  const marker = featureRequestMarker(request);
  const body = `${baseBody}\n\n${marker}`;
  let existing: FeatureRequestResult | undefined;
  try {
    existing = await findExisting(runner, marker, title, baseBody);
  } catch (error) {
    if (error instanceof NemligError) throw error;
    throw new NemligError("Could not check existing GitHub issues. Retry the same feature request; matching retries are safe.");
  }
  if (existing) return existing;

  let output: string;
  try {
    output = await runner([
      "issue",
      "create",
      "--repo",
      repository,
      "--title",
      title,
      "--body",
      body,
    ]);
  } catch (error) {
    try {
      existing = await findExisting(runner, marker, title, baseBody);
    } catch {
      // Preserve the original failure; retrying the same request remains safe.
    }
    if (existing) return existing;
    if (error instanceof NemligError) throw error;
    throw new NemligError("Could not create the GitHub issue. Retry the same feature request; matching retries are safe.");
  }
  const url = issueUrl(output);
  if (!url) throw new NemligError("GitHub issue creation returned no issue URL.");
  return resultFromUrl(title, url);
}
