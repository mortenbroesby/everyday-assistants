import assert from "node:assert/strict";
import test from "node:test";
import { publishGitHubPrerelease, validatePublicationJournal, type GitHubReleaseClient } from "../scripts/publish-release.js";

const sha = "a".repeat(40);
const version = "4.5.5-alpha.66";
const tag = `nemlig-assistant-v${version}`;
const note = `# Nemlig Assistant ${version}\n\n- Makes deployment release evidence readable.\n`;

function journal(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 2,
    operationId: "00000000-0000-4000-8000-000000000000",
    commit: sha,
    ciRunId: 101,
    releaseRunId: 202,
    releaseRunAttempt: 1,
    startedAt: "2026-09-12T10:00:00.000Z",
    completedAt: "2026-09-12T10:01:00.000Z",
    checks: ["edge_acceptance", "service_fixture_acceptance"],
    lastVerifiedState: "enabled",
    rollback: "not_needed",
    outcome: "success",
    transitions: [],
    ...overrides,
  });
}

class FakeGitHub implements GitHubReleaseClient {
  tagSha: string | undefined;
  release: Record<string, unknown> | undefined;
  readonly calls: string[] = [];
  failCreateTag = false;
  failCreateRelease = false;

  async getTag(name: string): Promise<{ sha: string; type: string } | undefined> {
    this.calls.push(`getTag:${name}`);
    return this.tagSha ? { sha: this.tagSha, type: "commit" } : undefined;
  }

  async createTag(name: string, target: string): Promise<void> {
    this.calls.push(`createTag:${name}:${target}`);
    this.tagSha = target;
    if (this.failCreateTag) throw new Error("uncertain tag response");
  }

  async getRelease(name: string): Promise<Record<string, unknown> | undefined> {
    this.calls.push(`getRelease:${name}`);
    return this.release;
  }

  async createRelease(input: { tag: string; target: string; name: string; body: string; prerelease: boolean }): Promise<void> {
    this.calls.push(`createRelease:${input.tag}`);
    this.release = {
      tag_name: input.tag,
      target_commitish: input.target,
      name: input.name,
      body: input.body,
      prerelease: input.prerelease,
      draft: false,
    };
    if (this.failCreateRelease) throw new Error("uncertain release response");
  }
}

function input(client: FakeGitHub) {
  return { client, repository: "mortenbroesby/everyday-assistants", candidate: sha, version, note, journal: journal(), expectedRunId: 202 };
}

test("publication journal requires exact successful routine deployment evidence", () => {
  assert.equal(validatePublicationJournal(journal(), { candidate: sha, expectedRunId: 202 }).commit, sha);
  for (const changes of [
    { commit: "b".repeat(40) },
    { releaseRunId: 203 },
    { outcome: "failed" },
    { lastVerifiedState: "restored" },
    { completedAt: undefined },
    { checks: ["edge_acceptance"] },
    { checks: ["edge_acceptance", "service_fixture_acceptance", "live_acceptance_pending"] },
  ]) {
    assert.throws(() => validatePublicationJournal(journal(changes), { candidate: sha, expectedRunId: 202 }), /journal|deployment|acceptance/i);
  }
});

test("publisher creates the exact prerelease once and then is a matching no-op", async () => {
  const client = new FakeGitHub();
  const first = await publishGitHubPrerelease(input(client));
  assert.equal(first.action, "published");
  assert.equal(client.tagSha, sha);
  assert.match(String(client.release?.body), /\/commit\//);
  assert.match(String(client.release?.body), /actions\/runs\/101/);
  assert.match(String(client.release?.body), /actions\/runs\/202/);
  const calls = client.calls.length;
  const repeated = await publishGitHubPrerelease(input(client));
  assert.equal(repeated.action, "no-op");
  assert.equal(client.calls.length, calls + 2);
});

test("publisher resumes a matching tag without a release and rejects conflicts", async () => {
  const partial = new FakeGitHub();
  partial.tagSha = sha;
  assert.equal((await publishGitHubPrerelease(input(partial))).action, "published");
  assert.deepEqual(partial.calls, [`getTag:${tag}`, `getRelease:${tag}`, `createRelease:${tag}`, `getRelease:${tag}`]);

  const tagConflict = new FakeGitHub();
  tagConflict.tagSha = "b".repeat(40);
  await assert.rejects(() => publishGitHubPrerelease(input(tagConflict)), /tag.*different commit/i);

  const releaseConflict = new FakeGitHub();
  releaseConflict.tagSha = sha;
  releaseConflict.release = { tag_name: tag, target_commitish: sha, name: tag, body: "changed", prerelease: true, draft: false };
  await assert.rejects(() => publishGitHubPrerelease(input(releaseConflict)), /release.*conflicts/i);
});

test("publisher reconciles an uncertain write response before retrying", async () => {
  const tag = new FakeGitHub();
  tag.failCreateTag = true;
  assert.equal((await publishGitHubPrerelease(input(tag))).action, "published");
  assert.equal(tag.calls.filter((call) => call.startsWith("createTag")).length, 1);

  const release = new FakeGitHub();
  release.failCreateRelease = true;
  assert.equal((await publishGitHubPrerelease(input(release))).action, "published");
  assert.equal(release.calls.filter((call) => call.startsWith("createRelease")).length, 1);
});
