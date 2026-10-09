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

const hookPath = join(import.meta.dirname, "..", ".husky", "pre-commit");

const runHook = ({ fallowExit = 0, specExit = 0, lintExit = 0 } = {}) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "fallow-git-hook-test-"));
  try {
    const bin = join(tempRoot, "bin");
    const logPath = join(tempRoot, "commands.log");
    mkdirSync(bin);
    const stubs = {
      git: `#!/bin/sh\nprintf 'git %s\\n' "$*" >> "$HOOK_TEST_LOG"\nif [ "$1" = "rev-parse" ]; then printf '%s\\n' origin/main; elif [ "$1" = "merge-base" ]; then printf '%s\\n' base-sha; fi\n`,
      fallow: `#!/bin/sh\nprintf 'fallow %s\\n' "$*" >> "$HOOK_TEST_LOG"\nexit "$HOOK_TEST_FALLOW_EXIT"\n`,
      pnpm: `#!/bin/sh\nprintf 'pnpm %s\\n' "$*" >> "$HOOK_TEST_LOG"\ncase "$1" in\n  spec:validate) exit "$HOOK_TEST_SPEC_EXIT" ;;\n  lint) exit "$HOOK_TEST_LINT_EXIT" ;;\n  *) exit 97 ;;\nesac\n`,
    };
    for (const [name, source] of Object.entries(stubs)) {
      const path = join(bin, name);
      writeFileSync(path, source);
      chmodSync(path, 0o755);
    }

    const result = spawnSync("/bin/sh", [hookPath], {
      cwd: tempRoot,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 256_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        HOOK_TEST_LOG: logPath,
        HOOK_TEST_FALLOW_EXIT: String(fallowExit),
        HOOK_TEST_SPEC_EXIT: String(specExit),
        HOOK_TEST_LINT_EXIT: String(lintExit),
      },
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      signal: result.signal,
      commands: readFileSync(logPath, "utf8").trimEnd().split("\n"),
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

const commandsBeforeChecks = [
  "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
  "git merge-base origin/main HEAD",
  "fallow audit --base base-sha --quiet --gate-marker pre-commit",
];

test("pre-commit stops before spec and lint when Fallow fails", () => {
  const result = runHook({ fallowExit: 17 });
  assert.equal(result.status, 17);
  assert.equal(result.signal, null);
  assert.deepEqual(result.commands, [...commandsBeforeChecks]);
});

test("pre-commit stops before lint when spec validation fails", () => {
  const result = runHook({ specExit: 23 });
  assert.equal(result.status, 23);
  assert.equal(result.signal, null);
  assert.deepEqual(result.commands, [
    ...commandsBeforeChecks,
    "pnpm spec:validate",
  ]);
});

test("pre-commit propagates lint failure", () => {
  const result = runHook({ lintExit: 29 });
  assert.equal(result.status, 29);
  assert.equal(result.signal, null);
  assert.deepEqual(result.commands, [
    ...commandsBeforeChecks,
    "pnpm spec:validate",
    "pnpm lint",
  ]);
});

test("pre-commit runs checks in order when all commands succeed", () => {
  const result = runHook();
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(result.commands, [
    ...commandsBeforeChecks,
    "pnpm spec:validate",
    "pnpm lint",
  ]);
});
