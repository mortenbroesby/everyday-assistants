import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateReleaseNoteCandidate } from "./release-note.js";

const packagePath = "apps/nemlig-assistant/package.json";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

async function fixture(): Promise<{ repo: string; base: string }> {
  const repo = await mkdtemp(path.join(tmpdir(), "nemlig-release-note-"));
  await mkdir(path.join(repo, "apps/nemlig-assistant/src"), { recursive: true });
  await writeFile(path.join(repo, packagePath), '{"name":"nemlig-assistant","version":"0.1.0"}\n');
  await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 1;\n");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "release-test@example.invalid");
  git(repo, "config", "user.name", "Release Test");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "chore: baseline");
  return { repo, base: git(repo, "rev-parse", "HEAD") };
}

async function releaseChange(repo: string, version = "0.1.1-alpha.0"): Promise<void> {
  await writeFile(path.join(repo, "apps/nemlig-assistant/src/client.ts"), "export const value = 2;\n");
  await writeFile(path.join(repo, packagePath), `{"name":"nemlig-assistant","version":"${version}"}\n`);
}

async function note(repo: string, version: string, body = `# Nemlig Assistant ${version}\n\n- Fixes the deterministic release gate.\n`): Promise<void> {
  const notePath = path.join(repo, "apps/nemlig-assistant/release/notes", `${version}.md`);
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, body);
}

test("release notes are required only for exact-range release-bearing candidates", async () => {
  const { repo, base } = await fixture();
  try {
    await writeFile(path.join(repo, "README.md"), "docs\n");
    git(repo, "add", "."); git(repo, "commit", "-qm", "docs: clarify");
    assert.deepEqual(validateReleaseNoteCandidate({ repoRoot: repo, baseRef: base }), { eligible: false });

    await releaseChange(repo);
    await note(repo, "0.1.1-alpha.0");
    git(repo, "add", "."); git(repo, "commit", "-qm", "fix: runtime");
    assert.deepEqual(validateReleaseNoteCandidate({ repoRoot: repo, baseRef: base }), {
      eligible: true,
      version: "0.1.1-alpha.0",
      path: "apps/nemlig-assistant/release/notes/0.1.1-alpha.0.md",
      body: "# Nemlig Assistant 0.1.1-alpha.0\n\n- Fixes the deterministic release gate.\n",
    });
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("release notes fail closed for missing, malformed, wrong-version, or non-diff notes", async () => {
  for (const scenario of ["missing", "malformed", "wrong-version", "not-in-diff"] as const) {
    const { repo, base: initialBase } = await fixture();
    try {
      let base = initialBase;
      if (scenario === "not-in-diff") {
        await note(repo, "0.1.1-alpha.0");
        git(repo, "add", "."); git(repo, "commit", "-qm", "chore: old note");
        base = git(repo, "rev-parse", "HEAD");
      }
      await releaseChange(repo);
      if (scenario === "malformed") await note(repo, "0.1.1-alpha.0", "A prose note without an identity heading.\n");
      if (scenario === "wrong-version") await note(repo, "0.1.1-alpha.0", "# Nemlig Assistant 0.1.1-alpha.9\n\n- Wrong version.\n");
      git(repo, "add", "."); git(repo, "commit", "-qm", "fix: runtime");
      assert.throws(() => validateReleaseNoteCandidate({ repoRoot: repo, baseRef: base }), /release note|Markdown|candidate diff/i, scenario);
    } finally { await rm(repo, { recursive: true, force: true }); }
  }
});

test("release notes reject a second version note and oversized Markdown", async () => {
  const { repo, base } = await fixture();
  try {
    await releaseChange(repo);
    await note(repo, "0.1.1-alpha.0");
    await note(repo, "0.1.1-alpha.1");
    git(repo, "add", "."); git(repo, "commit", "-qm", "fix: runtime");
    assert.throws(() => validateReleaseNoteCandidate({ repoRoot: repo, baseRef: base }), /exactly one|release note/i);
  } finally { await rm(repo, { recursive: true, force: true }); }

  const oversized = await fixture();
  try {
    await releaseChange(oversized.repo);
    await note(oversized.repo, "0.1.1-alpha.0", `# Nemlig Assistant 0.1.1-alpha.0\n\n${"x".repeat(8 * 1024)}\n`);
    git(oversized.repo, "add", "."); git(oversized.repo, "commit", "-qm", "fix: runtime");
    assert.throws(() => validateReleaseNoteCandidate({ repoRoot: oversized.repo, baseRef: oversized.base }), /too large/i);
  } finally { await rm(oversized.repo, { recursive: true, force: true }); }
});
