import { spawnSync } from "node:child_process";

export function checkContainerEngine(env = process.env) {
  const engine = env.WRANGLER_DOCKER_BIN || "docker";
  const result = spawnSync(engine, ["info"], {
    env,
    stdio: "ignore",
    timeout: 10_000,
    killSignal: "SIGKILL",
  });
  if (result.status !== 0) {
    console.error(
      "Container engine unavailable. Start the configured Docker-compatible engine and verify its CLI can run 'info' before retrying readiness.",
    );
    return false;
  }
  return true;
}

if (import.meta.main && !checkContainerEngine()) {
  process.exitCode = 1;
}
