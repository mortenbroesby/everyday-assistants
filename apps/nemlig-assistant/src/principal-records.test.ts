import assert from "node:assert/strict";
import test from "node:test";
import { encryptCredentials } from "./credential-envelope.js";
import {
  findPrincipalRecord,
  admitPrincipalRequest,
  consumeValidationRate,
  consumePortalCsrf,
  getCredentialRecord,
  registerInvitedPrincipal,
  replaceCredentialRecord,
  revokeCredentialRecord,
  setPrincipalStatus,
  type PrincipalStorage,
} from "./principal-records.js";
import type { emptyUsageState, TierAdmissionPolicy } from "./cloudflare-usage.js";

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

const invitation = { subject: "auth0|guest", organizationId: "org_abcdefgh", invitationIdHash: "1".repeat(64) };
const encodedKey = Buffer.alloc(32, 7).toString("base64url");

test("invitation registration is bounded, idempotent, and subject scoped", async () => {
  const storage = new MemoryStorage();
  const first = await registerInvitedPrincipal(storage, invitation, new Date("2026-09-06T00:00:00Z"));
  const replay = await registerInvitedPrincipal(storage, invitation, new Date("2026-09-06T01:00:00Z"));
  assert.deepEqual(replay, first);
  const reinvited = await registerInvitedPrincipal(storage, { ...invitation, invitationIdHash: "2".repeat(64) });
  assert.deepEqual(reinvited, first);
  assert.equal((await findPrincipalRecord(storage, invitation.subject))?.principal_key, first.principal_key);
  assert.equal(await findPrincipalRecord(storage, "auth0|other"), undefined);
  assert.equal([...storage.values.keys()].some((key) => key.includes(invitation.subject)), false);
});

test("validated replacement is atomic and failed or concurrent rotations preserve one generation", async () => {
  const storage = new MemoryStorage();
  const principal = await registerInvitedPrincipal(storage, invitation);
  const binding = { principalKey: principal.principal_key, policyRevision: "family-v2", keyVersion: "one", generation: 1 };
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
  const principal = await registerInvitedPrincipal(storage, invitation);
  const other = await registerInvitedPrincipal(storage, { ...invitation, subject: "auth0|other", invitationIdHash: "2".repeat(64) });
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family-v2", keyVersion: "one", generation: 1 },
    encodedKey,
  );
  await assert.rejects(replaceCredentialRecord(storage, other, envelope, true), /Principal record request is invalid/u);
  await assert.rejects(setPrincipalStatus(storage, principal.subject, "enabled", true), /Principal record request is invalid/u);
  await replaceCredentialRecord(storage, principal, envelope, true);
  assert.equal((await setPrincipalStatus(storage, principal.subject, "enabled", true))?.status, "enabled");
  assert.equal((await setPrincipalStatus(storage, principal.subject, "disabled"))?.status, "disabled");
  assert.equal((await setPrincipalStatus(storage, principal.subject, "revoked"))?.status, "revoked");
  assert.equal(await getCredentialRecord(storage, principal), undefined);
  assert.equal(await revokeCredentialRecord(storage, other), false);
});

test("atomic admission requires the current sealed credential without another storage boundary", async () => {
  const storage = new MemoryStorage();
  const principal = await registerInvitedPrincipal(storage, invitation);
  const policy: TierAdmissionPolicy = {
    revision: "family-v2",
    principalKeys: ["a".repeat(32)],
    budgets: {
      principal_minute_limits: { "0": 20, "1": 20, "2": 20 },
      tier0_reserve: { minute: 20, month: 30_000 }, guest_limit: { minute: 20, month: 30_000 },
      tier1_shed_at: { minute: 20, month: 30_000 }, tier2_shed_at: { minute: 20, month: 30_000 },
    },
  };
  const limits = { dailyLimit: 5_000, expensiveDailyLimit: 500, rateLimit: 60, expensiveRateLimit: 10 };
  const missing = await admitPrincipalRequest(storage, "normal", limits, { principalKey: principal.principal_key, tier: 1 }, policy, true);
  assert.deepEqual({ admitted: missing.admitted, ...(!missing.admitted ? { reason: missing.reason } : {}) }, { admitted: false, reason: "credential_required" });
  assert.equal(await storage.get("usage"), undefined);
  const envelope = await encryptCredentials(
    { username: "guest@example.test", password: "secret" },
    { principalKey: principal.principal_key, policyRevision: "family-v2", keyVersion: "one", generation: 1 }, encodedKey,
  );
  await replaceCredentialRecord(storage, principal, envelope, true);
  const admitted = await admitPrincipalRequest(storage, "normal", limits, { principalKey: principal.principal_key, tier: 1 }, policy, true);
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) assert.deepEqual(admitted.credential, envelope);
  assert.equal((await storage.get<ReturnType<typeof emptyUsageState>>("usage"))?.normalCount, 1);
});

test("credential validation rate limits stop before backend work", async () => {
  const storage = new MemoryStorage();
  const key = "a".repeat(32);
  const now = new Date("2026-09-06T12:00:00Z");
  assert.equal(await consumeValidationRate(storage, key, 2, 3, now), true);
  assert.equal(await consumeValidationRate(storage, key, 2, 3, now), true);
  assert.equal(await consumeValidationRate(storage, key, 2, 3, now), false);
  assert.equal(await consumeValidationRate(storage, "b".repeat(32), 2, 3, now), true);
  assert.equal(await consumeValidationRate(storage, "c".repeat(32), 2, 3, now), false);
  assert.equal(await consumeValidationRate(storage, key, 2, 3, new Date("2026-09-06T12:01:00Z")), true);
});

test("portal CSRF tokens are accepted once per subject", async () => {
  const storage = new MemoryStorage();
  const expiresAt = Date.now() + 60_000;
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), expiresAt), true);
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "a".repeat(32), expiresAt), false);
  assert.equal(await consumePortalCsrf(storage, "auth0|other", "a".repeat(32), expiresAt), true);
  assert.equal(await consumePortalCsrf(storage, "auth0|guest", "b".repeat(32), Date.now() - 1), false);
});
