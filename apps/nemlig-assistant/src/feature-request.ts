import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NemligError } from "./client.js";

const execute = promisify(execFile);
const repository = "mortenbroesby/everyday-assistants";

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
  const { stdout } = await execute("gh", args, { encoding: "utf8" });
  return stdout;
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

export async function createFeatureRequest(
  request: FeatureRequest,
  runner: GhRunner = runGh,
): Promise<FeatureRequestResult> {
  const title = clean(request.title, "Title", 120);
  const body = featureRequestBody(request);
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
  } catch {
    throw new NemligError("Could not create the GitHub issue. Verify `gh auth status -h github.com`.");
  }
  const url = output.trim().split(/\s+/u).find((value) => /^https:\/\/github\.com\/mortenbroesby\/everyday-assistants\/issues\/\d+$/u.test(value));
  if (!url) throw new NemligError("GitHub issue creation returned no issue URL.");
  return { number: Number(url.slice(url.lastIndexOf("/") + 1)), title, url };
}
