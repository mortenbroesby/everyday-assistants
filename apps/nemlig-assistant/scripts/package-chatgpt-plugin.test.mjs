import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePackage = resolve(appRoot, 'chatgpt-plugin-source');
const sourcePackager = resolve(appRoot, 'scripts/package-chatgpt-plugin.mjs');

const createFixture = () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'nemlig-plugin-package-test-'));
  const fixtureAppRoot = join(tempRoot, 'app');
  mkdirSync(join(fixtureAppRoot, 'scripts'), { recursive: true });
  cpSync(sourcePackage, join(fixtureAppRoot, 'chatgpt-plugin-source'), {
    recursive: true,
  });
  cpSync(
    resolve(appRoot, 'wrangler.jsonc'),
    join(fixtureAppRoot, 'wrangler.jsonc'),
  );
  cpSync(
    sourcePackager,
    join(fixtureAppRoot, 'scripts/package-chatgpt-plugin.mjs'),
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
      join(fixture.fixtureAppRoot, 'scripts/package-chatgpt-plugin.mjs'),
      '--output',
      outputPath,
    ],
    {
      cwd: fixture.tempRoot,
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 256_000,
    },
  );

test('packages the configured plugin with the pinned plugin artwork', () => {
  const fixture = createFixture();
  try {
    const outputPath = join(fixture.tempRoot, 'plugin.zip');
    const result = runPackager(fixture, outputPath);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(outputPath));
    const archivedIcon = execFileSync('unzip', [
      '-p',
      outputPath,
      'nemlig-shopping/assets/icon.png',
    ]);
    const sourceIcon = readFileSync(
      join(
        fixture.fixtureAppRoot,
        'chatgpt-plugin-source/nemlig-shopping/assets/icon.png',
      ),
    );
    assert.deepEqual(archivedIcon, sourceIcon);
  } finally {
    fixture.cleanup();
  }
});

test('rejects a plugin icon that differs from the pinned plugin artwork', () => {
  const fixture = createFixture();
  try {
    appendFileSync(
      join(
        fixture.fixtureAppRoot,
        'chatgpt-plugin-source/nemlig-shopping/assets/icon.png',
      ),
      Buffer.from([0]),
    );
    const outputPath = join(fixture.tempRoot, 'plugin.zip');
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
