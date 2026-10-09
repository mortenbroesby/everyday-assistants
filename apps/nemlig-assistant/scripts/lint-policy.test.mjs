import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Oxlint enforces the app's explicit import and block rules", () => {
  const appRoot = join(import.meta.dirname, "..");
  const tempRoot = mkdtempSync(join(tmpdir(), "nemlig-oxlint-"));
  try {
    copyFileSync(
      join(appRoot, ".oxlintrc.json"),
      join(tempRoot, ".oxlintrc.json"),
    );
    mkdirSync(join(tempRoot, "src"));
    const sourcePath = join(tempRoot, "src", "mcp.ts");
    const lint = () => {
      const result = spawnSync(
        join(appRoot, "node_modules", ".bin", "oxlint"),
        ["src/mcp.ts", "--deny-warnings"],
        { cwd: tempRoot, encoding: "utf8", timeout: 30_000 },
      );
      if (result.error) {
        throw result.error;
      }
      return result;
    };

    writeFileSync(
      sourcePath,
      'import { Stats } from "node:fs";\nimport "./cli.js";\nexport type FileStats = Stats;\nif (process.env.NODE_ENV) console.log("ok");\n',
    );
    const invalid = lint();
    const diagnostics = invalid.stdout + invalid.stderr;
    assert.equal(invalid.status, 1, diagnostics);
    for (const rule of [
      "typescript(consistent-type-imports)",
      "eslint(no-restricted-imports)",
      "eslint(curly)",
    ]) {
      assert.ok(diagnostics.includes(rule), `${rule}: ${diagnostics}`);
    }

    writeFileSync(
      sourcePath,
      'import type { Stats } from "node:fs";\nexport type FileStats = Stats;\nif (process.env.NODE_ENV) { console.log("ok"); }\n',
    );
    const valid = lint();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
