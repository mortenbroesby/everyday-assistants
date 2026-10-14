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

const runHook = (
  hook,
  exitCode = 0,
  upstream = "origin/main",
  whitespaceExit = 0,
) => {
  const directory = mkdtempSync(join(tmpdir(), "git-hook-test-"));
  try {
    const bin = join(directory, "bin");
    const logPath = join(directory, "commands.log");
    mkdirSync(bin);
    const stubs = {
      git: `#!/bin/sh\nprintf 'git %s\\n' "$*" >> "$HOOK_TEST_LOG"\ncase "$1" in\n  diff) exit "$HOOK_TEST_WHITESPACE_EXIT" ;;\n  rev-parse) [ -n "$HOOK_TEST_UPSTREAM" ] || exit 1; printf '%s\\n' "$HOOK_TEST_UPSTREAM" ;;\n  merge-base) printf '%s\\n' base-sha ;;\n  *) exit 97 ;;\nesac\n`,
      fallow: `#!/bin/sh\nprintf 'fallow %s\\n' "$*" >> "$HOOK_TEST_LOG"\nexit "$HOOK_TEST_EXIT"\n`,
      pnpm: `#!/bin/sh\nprintf 'pnpm %s\\n' "$*" >> "$HOOK_TEST_LOG"\nexit "$HOOK_TEST_EXIT"\n`,
    };
    for (const [name, source] of Object.entries(stubs)) {
      const path = join(bin, name);
      writeFileSync(path, source);
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
        HOOK_TEST_UPSTREAM: upstream,
        HOOK_TEST_WHITESPACE_EXIT: String(whitespaceExit),
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

for (const upstream of ["origin/main", "origin/feature", ""]) {
  for (const exitCode of [0, 17]) {
    test(`pre-commit retains new-only Fallow audit (${upstream || "fallback"}, exit ${exitCode})`, () => {
      const result = runHook("pre-commit", exitCode, upstream);
      assert.equal(result.status, exitCode);
      assert.equal(result.signal, null);
      assert.deepEqual(result.commands, [
        "git diff --cached --check",
        "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
        ...(upstream ? [`git merge-base ${upstream} HEAD`] : []),
        `fallow audit --base ${upstream ? "base-sha" : "main"} --gate new-only --quiet --gate-marker pre-commit`,
      ]);
    });
  }
}

test("pre-commit stops before audit when staged whitespace fails", () => {
  const result = runHook("pre-commit", 0, "origin/main", 23);
  assert.equal(result.status, 23);
  assert.deepEqual(result.commands, ["git diff --cached --check"]);
});

for (const exitCode of [0, 17]) {
  test(`pre-push runs only fast verify and propagates exit ${exitCode}`, () => {
    const result = runHook("pre-push", exitCode);
    assert.equal(result.status, exitCode);
    assert.equal(result.signal, null);
    assert.deepEqual(result.commands, ["pnpm verify"]);
  });
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
