import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePackage = resolve(appRoot, "chatgpt-plugin-source");
const sourcePackager = resolve(appRoot, "scripts/package-chatgpt-plugin.mjs");

const createFixture = () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "nemlig-plugin-package-test-"));
  const fixtureAppRoot = join(tempRoot, "app");
  mkdirSync(join(fixtureAppRoot, "scripts"), { recursive: true });
  cpSync(sourcePackage, join(fixtureAppRoot, "chatgpt-plugin-source"), {
    recursive: true,
  });
  cpSync(
    resolve(appRoot, "wrangler.jsonc"),
    join(fixtureAppRoot, "wrangler.jsonc"),
  );
  cpSync(
    sourcePackager,
    join(fixtureAppRoot, "scripts/package-chatgpt-plugin.mjs"),
  );
  return {
    tempRoot,
    fixtureAppRoot,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
};

const runPackager = (fixture, outputPath) =>
  spawnSync(
    process.execPath,
    [
      join(fixture.fixtureAppRoot, "scripts/package-chatgpt-plugin.mjs"),
      "--output",
      outputPath,
    ],
    {
      cwd: fixture.tempRoot,
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 256_000,
    },
  );

const readArchiveText = (archive, entry) =>
  execFileSync("unzip", ["-p", archive, `nemlig-shopping/${entry}`], {
    encoding: "utf8",
  });

const assertCurrentShoppingGuidance = (manifest, skill) => {
  const guidance = [
    manifest.description,
    manifest.extensions["com.openai"].interface.defaultPrompt,
    manifest.extensions["com.openai"].interface.longDescription,
    skill,
  ].join("\n");
  assert.match(guidance, /temporary (?:basket )?draft/iu);
  assert.match(skill, /start_product_review.*items/iu);
  assert.match(skill, /draft_id.*review_context_id/iu);
  assert.match(skill, /submission_id/iu);
  assert.match(skill, /app-only.*save_basket_as_shopping_list/iu);
  assert.doesNotMatch(
    guidance,
    /automatically saved shopping list|generate one creation_id|edits persist directly to (?:the|a) (?:selected )?list/iu,
  );
};

test("packages the configured plugin with the pinned plugin artwork", () => {
  const fixture = createFixture();
  try {
    const outputPath = join(fixture.tempRoot, "plugin.zip");
    const result = runPackager(fixture, outputPath);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(outputPath));
    const archivedIcon = execFileSync("unzip", [
      "-p",
      outputPath,
      "nemlig-shopping/assets/icon.png",
    ]);
    const sourceIcon = readFileSync(
      join(
        fixture.fixtureAppRoot,
        "chatgpt-plugin-source/nemlig-shopping/assets/icon.png",
      ),
    );
    assert.deepEqual(archivedIcon, sourceIcon);
    const manifest = JSON.parse(readArchiveText(outputPath, "plugin.json"));
    const desktopManifest = JSON.parse(
      readArchiveText(outputPath, ".codex-plugin/plugin.json"),
    );
    const skill = readArchiveText(
      outputPath,
      "skills/grocery-shopping/SKILL.md",
    );
    assert.equal(manifest.version, "0.1.7");
    assert.equal(desktopManifest.version, manifest.version);
    assert.equal(desktopManifest.description, manifest.description);
    assert.deepEqual(
      desktopManifest.interface,
      manifest.extensions["com.openai"].interface,
    );
    assert.deepEqual(
      manifest,
      JSON.parse(
        readFileSync(
          join(
            fixture.fixtureAppRoot,
            "chatgpt-plugin-source/nemlig-shopping/plugin.json",
          ),
          "utf8",
        ),
      ),
    );
    assert.equal(
      skill,
      readFileSync(
        join(
          fixture.fixtureAppRoot,
          "chatgpt-plugin-source/nemlig-shopping/skills/grocery-shopping/SKILL.md",
        ),
        "utf8",
      ),
    );
    assertCurrentShoppingGuidance(manifest, skill);
    assert.match(readArchiveText(outputPath, "README.md"), /temporary/u);
    assert.match(
      readArchiveText(outputPath, "mcp.json"),
      /https:\/\/nemlig-mcp\.broesby\.dk\/mcp/u,
    );
    assert.match(
      readArchiveText(outputPath, ".app.json"),
      /asdk_app_6ac7995a68648191bafab7459ab55953/u,
    );
  } finally {
    fixture.cleanup();
  }
});

test("packaged guidance check catches superseded native-list instructions", () => {
  const manifest = JSON.parse(
    readFileSync(join(sourcePackage, "nemlig-shopping/plugin.json"), "utf8"),
  );
  const skill = readFileSync(
    join(sourcePackage, "nemlig-shopping/skills/grocery-shopping/SKILL.md"),
    "utf8",
  );
  assertCurrentShoppingGuidance(manifest, skill);
  assert.throws(() =>
    assertCurrentShoppingGuidance(
      manifest,
      `${skill}\nGenerate one creation_id for an automatically saved shopping list.`,
    ),
  );
});

test("rejects a stale desktop plugin manifest", () => {
  const fixture = createFixture();
  try {
    const outputPath = join(fixture.tempRoot, "plugin.zip");
    const desktopManifestPath = join(
      fixture.fixtureAppRoot,
      "chatgpt-plugin-source/nemlig-shopping/.codex-plugin/plugin.json",
    );
    const desktopManifest = JSON.parse(
      readFileSync(desktopManifestPath, "utf8"),
    );
    desktopManifest.version = "0.1.6";
    writeFileSync(desktopManifestPath, JSON.stringify(desktopManifest));
    const result = runPackager(fixture, outputPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /desktop plugin manifest must mirror/u);
    assert.equal(existsSync(outputPath), false);
  } finally {
    fixture.cleanup();
  }
});

test("rejects a plugin icon that differs from the pinned plugin artwork", () => {
  const fixture = createFixture();
  try {
    appendFileSync(
      join(
        fixture.fixtureAppRoot,
        "chatgpt-plugin-source/nemlig-shopping/assets/icon.png",
      ),
      Buffer.from([0]),
    );
    const outputPath = join(fixture.tempRoot, "plugin.zip");
    const result = runPackager(fixture, outputPath);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /The plugin icon must match the pinned plugin artwork/u,
    );
    assert.equal(existsSync(outputPath), false);
  } finally {
    fixture.cleanup();
  }
});
