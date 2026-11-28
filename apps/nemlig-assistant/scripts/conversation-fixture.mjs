import process from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";

export async function withConversationFixture(run, timeoutMs = 120000) {
  const fixture = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/agent-routing-fixture.ts"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const stopped = once(fixture, "close");
  const deadline = setTimeout(() => fixture.kill("SIGKILL"), timeoutMs);
  const lines = createInterface({ input: fixture.stdout });
  let finalCounts;
  lines.on("line", (line) => {
    const record = JSON.parse(line);
    if (record.event === "stopped") {
      finalCounts = record.counts;
    }
  });
  try {
    const [line] = await Promise.race([
      once(lines, "line"),
      stopped.then(() => {
        throw Error("Fixture exited before startup");
      }),
    ]);
    const { url } = JSON.parse(line);
    assert.equal(new URL(url).hostname, "127.0.0.1");
    await run({ url });
  } finally {
    fixture.kill("SIGTERM");
    try {
      const [code] = await stopped;
      assert.equal(code, 0, "Fixture stopped without a clean exit");
      assert.equal(
        finalCounts?.forbidden,
        0,
        "Fixture recorded forbidden provider access or lost its counters",
      );
    } finally {
      clearTimeout(deadline);
      lines.close();
    }
  }
}
