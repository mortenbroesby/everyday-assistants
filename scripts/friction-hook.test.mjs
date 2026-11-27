import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = new URL(
  "../.agents/hooks/friction-reminder.mjs",
  import.meta.url,
);
const run = (input) => {
  const result = spawnSync(process.execPath, [script.pathname], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    timeout: 2000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
};

for (const event of ["Stop", "Interrupt"]) {
  test(`${event} emits only a bounded advisory without input data`, () => {
    const output = run({
      hook_event_name: event,
      last_assistant_message: "PRIVATE_SENTINEL",
      transcript_path: "/PRIVATE_SENTINEL",
    });
    assert.deepEqual(Object.keys(output), ["systemMessage"]);
    assert.match(output.systemMessage, /\.friction\/README.md/u);
    assert.doesNotMatch(JSON.stringify(output), /PRIVATE_SENTINEL/u);
    assert.ok(Buffer.byteLength(JSON.stringify(output)) < 500);
  });
}

test("invalid, unrelated, repeated and oversized inputs are neutral", () => {
  for (const input of [
    "{",
    "null",
    "[]",
    {},
    { hook_event_name: "PreToolUse" },
    { hook_event_name: "Stop", stop_hook_active: true },
    "x".repeat(70000),
  ]) {
    assert.deepEqual(run(input), {});
  }
});

test("native wiring preserves advisory and quality hooks", () => {
  const config = JSON.parse(
    readFileSync(new URL("../.codex/hooks.json", import.meta.url), "utf8"),
  );
  assert.equal(config.hooks.PreToolUse.length, 2);
  for (const event of ["Stop", "Interrupt"]) {
    const hooks = config.hooks[event].flatMap((entry) => entry.hooks);
    assert.equal(hooks.length, 1);
    assert.match(hooks[0].command, /friction-reminder\.mjs/u);
    assert.ok(hooks[0].timeout <= 3);
  }
});
