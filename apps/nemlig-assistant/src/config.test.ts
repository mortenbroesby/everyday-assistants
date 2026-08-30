import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearCredentials, getCredentials, promptCredentials, saveCredentials } from "./config.js";

test("credentials prefer a complete environment pair and tolerate malformed files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nemlig-config-"));
  const file = join(directory, "credentials.json");
  t.after(() => clearCredentials(file));

  await writeFile(file, "not json");
  assert.equal(await getCredentials(file, {}), undefined);
  await saveCredentials({ username: "saved@example.test", password: "saved-secret" }, file);
  assert.deepEqual(await getCredentials(file, { NEMLIG_USERNAME: "partial@example.test" }), {
    username: "saved@example.test",
    password: "saved-secret",
  });
  assert.deepEqual(
    await getCredentials(file, {
      NEMLIG_USERNAME: "env@example.test",
      NEMLIG_PASSWORD: "env-secret",
    }),
    { username: "env@example.test", password: "env-secret" },
  );
});

test("saved credentials and their directory are owner-only, then clear cleanly", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "nemlig-save-"));
  const file = join(root, "nested", "credentials.json");
  t.after(() => clearCredentials(file));

  await saveCredentials({ username: "person@example.test", password: "secret-value" }, file);
  assert.equal((await stat(join(root, "nested"))).mode & 0o777, 0o700);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.match(await readFile(file, "utf8"), /person@example\.test/);
  await clearCredentials(file);
  assert.equal(await getCredentials(file, {}), undefined);
});

test("interactive credential collection fails cleanly without a terminal", async () => {
  await assert.rejects(promptCredentials(), /Run `pnpm nemlig login --save` in a terminal/);
});
