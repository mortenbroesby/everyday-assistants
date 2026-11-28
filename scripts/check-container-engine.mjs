import { spawnSync } from "node:child_process";

const engine = process.env.WRANGLER_DOCKER_BIN || "docker";
const result = spawnSync(engine, ["info"], {
  stdio: "ignore",
  timeout: 10_000,
  killSignal: "SIGKILL",
});

if (result.status !== 0) {
  console.error(
    "Container engine unavailable. Start the configured Docker-compatible engine and verify its CLI can run 'info' before retrying readiness.",
  );
  process.exitCode = 1;
}
