import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NemligError } from "./client.js";
import { ensureLoggedIn as ensureLoggedInFromCli } from "./cli.js";
import { ensureLoggedIn, getClient, withAuthenticatedReadRetry, NEMLIG_VERSION } from "./runtime.js";

test("ensureLoggedIn uses injected credentials and does not prompt", async () => {
  let loggedIn = false;
  const client: { isLoggedIn(): boolean; login(username: string, password: string): Promise<void> } = {
    isLoggedIn: () => loggedIn,
    login: async (username, password) => {
      assert.equal(username, "owner@example.test");
      assert.equal(password, "secret");
      loggedIn = true;
    },
  };
  await ensureLoggedIn(client, async () => ({ username: "owner@example.test", password: "secret" }));
  assert.equal(loggedIn, true);
  await assert.rejects(
    ensureLoggedIn({ ...client, isLoggedIn: () => false }, async () => undefined),
    NemligError,
  );
});

test("ensureLoggedIn preserves the CLI export and skips already logged-in clients", async () => {
  assert.equal(ensureLoggedInFromCli, ensureLoggedIn);
  let loaded = 0;
  let loggedIn = 0;
  await ensureLoggedIn(
    { isLoggedIn: () => true, login: async () => { loggedIn += 1; } },
    async () => { loaded += 1; return undefined; },
  );
  assert.equal(loaded, 0);
  assert.equal(loggedIn, 0);
});

test("ensureLoggedIn preserves login failures and runtime keeps package identity", async () => {
  const failure = new Error("login failed");
  await assert.rejects(
    ensureLoggedIn(
      { isLoggedIn: () => false, login: async () => { throw failure; } },
      async () => ({ username: "owner@example.test", password: "secret" }),
    ),
    (error) => error === failure,
  );
  assert.equal(getClient(), getClient());
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
  assert.equal(NEMLIG_VERSION, manifest.version);
});

test("read operations retry once after expired session", async () => {
  let calls = 0;
  let logins = 0;
  const client = {
    isLoggedIn: () => true,
    login: async () => {
      logins += 1;
    },
  };
  const result = await withAuthenticatedReadRetry(
    client,
    async () => ({ username: "owner@example.test", password: "secret" }),
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new NemligError("Search failed", 401);
      }
      return "result";
    },
  );
  assert.equal(result, "result");
  assert.equal(calls, 2);
  assert.equal(logins, 1);
});

test("expired session failures surface when a second 401 is returned", async () => {
  let calls = 0;
  let logins = 0;
  const client = {
    isLoggedIn: () => true,
    login: async () => {
      logins += 1;
    },
  };
  await assert.rejects(
    withAuthenticatedReadRetry(
      client,
      async () => ({ username: "owner@example.test", password: "secret" }),
      async () => {
        calls += 1;
        throw new NemligError("Search failed", 401);
      },
    ),
    (error) => error instanceof NemligError && error.status === 401,
  );
  assert.equal(calls, 2);
  assert.equal(logins, 1);
});
