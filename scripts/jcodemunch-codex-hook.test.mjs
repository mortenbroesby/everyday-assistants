import assert from "node:assert/strict";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const hook = join(
  import.meta.dirname,
  "..",
  ".agents",
  "hooks",
  "jcodemunch-advisory.mjs",
);

const invoke = (input) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hook], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });

test("advises only for search-shaped Codex shell commands", async () => {
  const result = await invoke({
    tool_name: "exec_command",
    tool_input: { cmd: "rg rankProducts apps", workdir: "/repo" },
  });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /JCodeMunch routing skill/);
  assert.doesNotMatch(result.stdout, /permissionDecision/);
});

test("stays silent for ordinary commands", async () => {
  const result = await invoke({
    tool_name: "exec_command",
    tool_input: { cmd: "git status --short", workdir: "/repo" },
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
});
