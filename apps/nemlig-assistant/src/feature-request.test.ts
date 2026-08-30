import assert from "node:assert/strict";
import test from "node:test";
import { createFeatureRequest, featureRequestBody } from "./feature-request.js";

test("feature requests create one concise issue with fixed gh arguments", async () => {
  const request = {
    title: "Prefer discounted favorites",
    summary: "Choose discounted favorites before catalog products.",
    acceptance_criteria: ["Search favorites first", "Prefer discounted matches"],
    context: "Requested in ChatGPT.",
  };
  let args: string[] = [];
  const result = await createFeatureRequest(request, async (received) => {
    args = received;
    return "https://github.com/mortenbroesby/everyday-assistants/issues/42\n";
  });
  assert.deepEqual(result, {
    number: 42,
    title: request.title,
    url: "https://github.com/mortenbroesby/everyday-assistants/issues/42",
  });
  assert.deepEqual(args.slice(0, 5), [
    "issue",
    "create",
    "--repo",
    "mortenbroesby/everyday-assistants",
    "--title",
  ]);
  assert.equal(args[5], request.title);
  assert.equal(args[6], "--body");
  assert.equal(args[7], featureRequestBody(request));
  assert.match(args[7] ?? "", /- \[ \] Search favorites first/);
});

test("feature request failures are sanitized", async () => {
  await assert.rejects(
    createFeatureRequest(
      { title: "Feature", summary: "Do the thing." },
      async () => { throw new Error("secret provider response"); },
    ),
    /Verify `gh auth status/,
  );
});
