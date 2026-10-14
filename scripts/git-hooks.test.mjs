import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

const runHook = (hook, exitCode = 0) => {
  const directory = mkdtempSync(join(tmpdir(), "git-hook-test-"));
  try {
    const bin = join(directory, "bin");
    const logPath = join(directory, "commands.log");
    mkdirSync(bin);
    for (const name of ["git", "pnpm", "fallow"]) {
      const path = join(bin, name);
      writeFileSync(
        path,
        `#!/bin/sh\nprintf '${name} %s\\n' "$*" >> "$HOOK_TEST_LOG"\nexit "$HOOK_TEST_EXIT"\n`,
      );
      chmodSync(path, 0o755);
    }
    const result = spawnSync("/bin/sh", [join(root, ".husky", hook)], {
      cwd: directory,
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HOOK_TEST_LOG: logPath,
        HOOK_TEST_EXIT: String(exitCode),
      },
    });
    if (result.error) {
      throw result.error;
    }
    return {
      status: result.status,
      signal: result.signal,
      commands: readFileSync(logPath, "utf8").trimEnd().split("\n"),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

for (const [hook, command] of [
  ["pre-commit", "git diff --cached --check"],
  ["pre-push", "pnpm verify"],
]) {
  for (const exitCode of [0, 17]) {
    test(`${hook} runs only its lightweight check and propagates exit ${exitCode}`, () => {
      const result = runHook(hook, exitCode);
      assert.equal(result.status, exitCode);
      assert.equal(result.signal, null);
      assert.deepEqual(result.commands, [command]);
    });
  }
}

test("local verify is lint-only while production readiness retains lint, build and format", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  assert.equal(scripts.verify, "turbo lint");
  assert.match(
    scripts["nemlig:production:ready"],
    /turbo run lint build && pnpm format:check/u,
  );
  assert.doesNotMatch(scripts["nemlig:production:ready"], /pnpm verify/u);
});
