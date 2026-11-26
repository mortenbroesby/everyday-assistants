import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Fallow's maintained gate consumes the Bash payload; Codex uses cmd/workdir.
// Keep command classification and audit interpretation in the upstream gate.
try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const input = payload.tool_input ?? {};
  payload.tool_input = { ...input, command: input.command ?? input.cmd ?? "" };
  payload.cwd = input.workdir ?? payload.cwd ?? process.cwd();
  const result = spawnSync(
    "bash",
    [join(import.meta.dirname, "../.codex/hooks/fallow-gate.sh")],
    { input: JSON.stringify(payload), encoding: "utf8", timeout: 110_000 },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 2;
} catch (error) {
  console.error(`Fallow hook could not run: ${error.message}`);
  process.exitCode = 2;
}
