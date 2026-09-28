import assert from "node:assert/strict";
import test from "node:test";
import { encryptCredentials } from "./credential-envelope.js";
import {
  findPrincipalRecord,
  admitPrincipalRequest,
  consumePortalCsrf,
  getCredentialRecord,
  replaceCredentialRecord,
  revokeCredentialRecord,
  setPrincipalStatus,
  type PrincipalStorage,
} from "./principal-records.js";
import type { AdmissionPolicy } from "./principal-records.js";

class MemoryStorage implements PrincipalStorage {
  readonly values = new Map<string, unknown>();
  private queue = Promise.resolve();
  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
}

const family = { subject: "auth0|family", principal_key: "a".repeat(32), enabled: true };
const encodedKey = Buffer.alloc(32, 7).toString("base64url");

test("configured family members without registry records can be disabled and revoked", async () => {
  const storage = new MemoryStorage();
  const principal = { subject: "auth0|family", principal_key: "a".repeat(32), enabled: true };
  const envelope = await encryptCredentials({ username: "family@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family", keyVersion: "one", generation: 1 }, encodedKey);
  await replaceCredentialRecord(storage, principal, envelope, true);
  assert.equal((await findPrincipalRecord(storage, principal.subject))?.principal_key, principal.principal_key);
  assert.equal((await setPrincipalStatus(storage, principal, "disabled"))?.status, "disabled");
  assert.equal((await setPrincipalStatus(storage, principal, "revoked"))?.status, "revoked");
  assert.equal(await getCredentialRecord(storage, principal), undefined);
});

test("credential commit cannot reactivate disabled/revoked access or change a configured key", async () => {
  const storage = new MemoryStorage();
  const principal = { subject: "auth0|family", principal_key: "a".repeat(32), enabled: true };
  const envelope = await encryptCredentials({ username: "family@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family", keyVersion: "one", generation: 1 }, encodedKey);
  await setPrincipalStatus(storage, principal, "disabled");
  await assert.rejects(replaceCredentialRecord(storage, principal, envelope, true), /Principal record/u);
  assert.equal(await getCredentialRecord(storage, principal), undefined);
  assert.equal((await findPrincipalRecord(storage, principal.subject))?.status, "disabled");
  await setPrincipalStatus(storage, principal, "revoked");
  await assert.rejects(replaceCredentialRecord(storage, principal, envelope, true), /Principal record/u);
  await assert.rejects(setPrincipalStatus(storage,
    { ...principal, principal_key: "b".repeat(32) }, "disabled"), /Principal record/u);
});

test("6001 credential admissions ignore obsolete usage state without counter reads or writes", async (context) => {
  const storage = new MemoryStorage();
  await storage.put("usage", { breakerOpen: true, normalCount: 5000, expensiveCount: 500 });
  const principal = family;
  const envelope = await encryptCredentials({ username: "family@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family", keyVersion: "one", generation: 1 }, encodedKey);
  await replaceCredentialRecord(storage, principal, envelope, true);
  const get = storage.get.bind(storage);
  const put = storage.put.bind(storage);
  context.mock.method(storage, "get", async (key: string) => {
    assert.notEqual(key, "usage");
    return get(key);
  });
  context.mock.method(storage, "put", async (key: string, value: unknown) => {
    assert.notEqual(key, "usage");
    return put(key, value);
  });
  for (let index = 0; index < 6001; index += 1) {
    assert.deepEqual(await admitPrincipalRequest(storage,
      { principalKey: principal.principal_key }, { revision: "family" }, true), { admitted: true, credential: envelope });
  }
});

test("validated replacement is atomic and failed or concurrent rotations preserve one generation", async () => {
  const storage = new MemoryStorage();
  const principal = family;
  const binding = { principalKey: principal.principal_key, policyRevision: "family-v3", keyVersion: "one", generation: 1 };
  const first = await encryptCredentials({ username: "guest@example.test", password: "first" }, binding, encodedKey);
  assert.equal((await replaceCredentialRecord(storage, principal, first, true))?.generation, 1);
  const rejected = await encryptCredentials({ username: "guest@example.test", password: "wrong" }, { ...binding, generation: 2 }, encodedKey);
  assert.equal((await replaceCredentialRecord(storage, principal, rejected, false))?.generation, 1);

  const next = await encryptCredentials({ username: "guest@example.test", password: "second" }, { ...binding, generation: 2 }, encodedKey);
  const results = await Promise.allSettled([
    replaceCredentialRecord(storage, principal, next, true),
    replaceCredentialRecord(storage, principal, next, true),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal((await getCredentialRecord(storage, principal))?.generation, 2);
});

test("principal boundaries, activation, disable, and revocation fail closed", async () => {
  const storage = new MemoryStorage();
  const principal = family;
  const other = { ...family, subject: "auth0|other", principal_key: "b".repeat(32) };
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family-v3", keyVersion: "one", generation: 1 },
    encodedKey,
  );
  await assert.rejects(replaceCredentialRecord(storage, other, envelope, true), /Principal record request is invalid/u);
  await assert.rejects(setPrincipalStatus(storage, principal, "enabled", true), /Principal record request is invalid/u);
  await replaceCredentialRecord(storage, principal, envelope, true);
  assert.equal((await setPrincipalStatus(storage, principal, "enabled", true))?.status, "enabled");
  assert.equal((await setPrincipalStatus(storage, principal, "disabled"))?.status, "disabled");
  assert.equal((await setPrincipalStatus(storage, principal, "revoked"))?.status, "revoked");
  assert.equal(await getCredentialRecord(storage, principal), undefined);
  assert.equal(await revokeCredentialRecord(storage, other), false);
});

test("atomic admission requires the current sealed credential without another storage boundary", async () => {
  const storage = new MemoryStorage();
  const principal = family;
  const policy: AdmissionPolicy = { revision: "family-v3" };
  const missing = await admitPrincipalRequest(storage, { principalKey: principal.principal_key }, policy, true);
  assert.deepEqual({ admitted: missing.admitted, ...(!missing.admitted ? { reason: missing.reason } : {}) }, { admitted: false, reason: "credential_required" });
  assert.equal(await storage.get("usage"), undefined);
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family-v3", keyVersion: "one", generation: 1 }, encodedKey,
  );
  await replaceCredentialRecord(storage, principal, envelope, true);
  const admitted = await admitPrincipalRequest(storage, { principalKey: principal.principal_key }, policy, true);
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) assert.deepEqual(admitted.credential, envelope);
  assert.equal(await storage.get("usage"), undefined);
});

test("service fixture credential-free admission has no accounting", async () => {
  const storage = new MemoryStorage();
  const policy: AdmissionPolicy = { revision: "family-v3" };
  const admitted = await admitPrincipalRequest(storage, { principalKey: "s".repeat(32) }, policy, false);
  assert.equal(admitted.admitted, true);
  assert.equal(await storage.get("usage"), undefined);
});

test("configured family credentials need no invitation record and reject stale policy or generation bindings", async () => {
  const storage = new MemoryStorage();
  const principal = family;
  const binding = { principalKey: principal.principal_key, policyRevision: "prior-policy", keyVersion: "one", generation: 1 };
  await replaceCredentialRecord(storage, principal, await encryptCredentials(
    { username: "family@example.test", password: "private-secret" }, binding, encodedKey,
  ), true);
  const admit = () => admitPrincipalRequest(storage,
    { principalKey: principal.principal_key }, { revision: "family-v3" }, true);
  const stale = await admit();
  assert.equal(stale.admitted, false);
  if (!stale.admitted) assert.equal(stale.reason, "credential_required");
  assert.equal(await storage.get("usage"), undefined);
  const current = await encryptCredentials({ username: "family@example.test", password: "private-secret" },
    { ...binding, policyRevision: "family-v3", generation: 2 }, encodedKey);
  const record = await replaceCredentialRecord(storage, principal, current, true);
  assert.equal((await admit()).admitted, true);
  assert.equal((await findPrincipalRecord(storage, principal.subject))?.principal_key, principal.principal_key);
  assert.ok(record);
  await storage.put(`credential:${principal.principal_key}`, { ...record, generation: 3 });
  assert.equal((await admit()).admitted, false);
  assert.equal(await storage.get("usage"), undefined);
  await revokeCredentialRecord(storage, principal);
  assert.equal((await admit()).admitted, false);
  assert.equal(await storage.get("usage"), undefined);
});

test("portal CSRF tokens are accepted once per subject", async () => {
  const storage = new MemoryStorage();
  const expiresAt = Date.now() + 60_000;
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), expiresAt), true);
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), expiresAt), false);
  assert.equal(await consumePortalCsrf(storage, "auth0|other", "a".repeat(32), expiresAt), true);
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "b".repeat(32), Date.now() - 1), false);
});

test("CSRF replay storage is atomic, expires old entries, and fails closed", async (context) => {
  let now = Date.parse("2026-09-28T12:00:00Z");
  context.mock.method(Date, "now", () => now);
  const storage = new MemoryStorage();
  const results = await Promise.all([
    consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), now + 1000),
    consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), now + 1000),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  now += 1001;
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "b".repeat(32), now + 1000), true);
  const records = [...storage.values.values()] as Array<Array<{ hash: string; expiresAt: number }>>;
  assert.equal(records[0]?.length, 1, "expired replay entries are removed on the next action");
  context.mock.method(storage, "put", async () => { throw new Error("storage unavailable"); });
  await assert.rejects(consumePortalCsrf(storage, "auth0|guest", "c".repeat(32), now + 1000), /storage unavailable/u);
});
