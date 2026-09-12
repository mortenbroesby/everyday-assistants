import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";

import { discoverAgentArtifactPaths, validateManifest } from "./check-agent-artifacts.mjs";

function write(root, path, contents = "fixture\n") {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "agent-artifacts-"));
  write(root, "AGENTS.md");
  write(root, ".agents/instructions/ready.md");
  write(root, ".agents/skills/example/SKILL.md", "---\nname: example\ndescription: Example skill.\n---\n");

  const artifacts = [
    { id: "root", kind: "instruction", path: "AGENTS.md", scope: "repository", summary: "Root guidance." },
    { id: "ready", kind: "instruction", path: ".agents/instructions/ready.md", scope: "repository", summary: "Readiness guidance." },
    { id: "example", kind: "skill", path: ".agents/skills/example/SKILL.md", scope: "repository", summary: "Example skill.", skillName: "example" },
  ];
  const manifest = {
    schemaVersion: 1,
    metadata: {
      purpose: "Discover repository agent guidance.",
      authority: "This manifest discovers guidance; it does not override guidance or authorize action.",
    },
    artifacts,
    routes: [{ id: "ordinary", intent: "Ordinary work", scope: "repository", use: ["root", "ready", "example"] }],
  };
  return { root, manifest };
}

function messages(errors) {
  return errors.join("\n");
}

test("accepts a complete manifest", () => {
  const { root, manifest } = fixture();
  try {
    assert.deepEqual(validateManifest(manifest, { root, trackedPaths: manifest.artifacts.map(({ path }) => path) }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed top-level shape", () => {
  const { root, manifest } = fixture();
  try {
    manifest.unexpected = true;
    assert.match(messages(validateManifest(manifest, { root })), /unexpected key/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects missing route references", () => {
  const { root, manifest } = fixture();
  try {
    manifest.routes[0].use.push("missing");
    assert.match(messages(validateManifest(manifest, { root })), /unknown artifact "missing"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an unlisted discovered skill", () => {
  const { root, manifest } = fixture();
  try {
    write(root, "apps/demo/.codex/skills/unlisted/SKILL.md", "---\nname: unlisted\ndescription: Missing from manifest.\n---\n");
    assert.match(messages(validateManifest(manifest, { root })), /unlisted agent artifact.*unlisted\/SKILL\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovers instruction files reached through file symlinks", () => {
  const { root } = fixture();
  try {
    write(root, "apps/demo/AGENTS.md");
    symlinkSync("AGENTS.md", resolve(root, "apps/demo/CLAUDE.md"));
    assert.ok(discoverAgentArtifactPaths(root).includes("apps/demo/CLAUDE.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects duplicate ids and paths", () => {
  const { root, manifest } = fixture();
  try {
    manifest.artifacts.push({ ...manifest.artifacts[0] });
    const result = messages(validateManifest(manifest, { root }));
    assert.match(result, /duplicate artifact id "root"/);
    assert.match(result, /duplicate artifact path "AGENTS\.md"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects paths that escape the repository", () => {
  const { root, manifest } = fixture();
  try {
    manifest.artifacts[0].path = "../AGENTS.md";
    assert.match(messages(validateManifest(manifest, { root })), /safe repository-relative path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects dependency and read-before cycles", () => {
  const { root, manifest } = fixture();
  try {
    manifest.artifacts[0].dependsOn = ["ready"];
    manifest.artifacts[1].readBefore = ["root"];
    assert.match(messages(validateManifest(manifest, { root })), /reference cycle/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
