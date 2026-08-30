import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeatureRequest,
  featureRequestBody,
} from "./feature-request.js";

const issue = {
  number: 42,
  title: "Prefer discounted favorites",
  url: "https://github.com/mortenbroesby/everyday-assistants/issues/42",
};

test("feature requests create one concise, idempotent issue with fixed gh arguments", async () => {
  const request = {
    title: "Prefer discounted favorites",
    summary: "Choose discounted favorites before catalog products.",
    acceptance_criteria: ["Search favorites first", "Prefer discounted matches"],
    context: "Requested in ChatGPT.",
  };
  const calls: string[][] = [];
  const result = await createFeatureRequest(request, async (received) => {
    calls.push(received);
    return received[1] === "list" ? "[]" : `${issue.url}\n`;
  });
  assert.deepEqual(result, issue);
  assert.equal(calls.length, 2);
  const args = calls[1] ?? [];
  assert.deepEqual(args.slice(0, 5), [
    "issue",
    "create",
    "--repo",
    "mortenbroesby/everyday-assistants",
    "--title",
  ]);
  assert.equal(args[5], request.title);
  assert.equal(args[6], "--body");
  assert.ok(args[7]?.startsWith(featureRequestBody(request)));
  assert.match(args[7] ?? "", /- \[ \] Search favorites first/);
  assert.match(args[7] ?? "", /<!-- nemlig-feature-request:[a-f0-9]{64} -->/);
});

test("matching legacy retries return the existing issue without creating another", async () => {
  let calls = 0;
  const request = {
    title: issue.title,
    summary: "Choose discounted favorites before catalog products.",
  };
  const result = await createFeatureRequest(
    request,
    async (args) => {
      calls += 1;
      assert.equal(args[1], "list");
      assert.equal(args.at(-1), "body,title,url");
      return JSON.stringify([{
        body: featureRequestBody(request),
        title: issue.title,
        url: issue.url,
      }]);
    },
  );
  assert.deepEqual(result, issue);
  assert.equal(calls, 1);
});

test("a timed-out creation reconciles a late GitHub success", async () => {
  let calls = 0;
  let createdBody = "";
  const result = await createFeatureRequest(
    { title: issue.title, summary: "Choose discounted favorites before catalog products." },
    async (args) => {
      calls += 1;
      if (calls === 1) return "[]";
      if (calls === 2) {
        createdBody = args[7] ?? "";
        throw new Error("timed out after GitHub accepted the request");
      }
      return JSON.stringify([{ body: createdBody, title: issue.title, url: issue.url }]);
    },
  );
  assert.deepEqual(result, issue);
  assert.equal(calls, 3);
});

test("feature request failures are sanitized and explicitly safe to retry", async () => {
  await assert.rejects(
    createFeatureRequest(
      { title: "Feature", summary: "Do the thing." },
      async () => { throw new Error("secret provider response"); },
    ),
    /matching retries are safe/,
  );
});
