import assert from "node:assert/strict";
import test from "node:test";
import { decryptCredentials, encryptCredentials, type CredentialBinding } from "./credential-envelope.js";

const key = (byte: number): string => Buffer.alloc(32, byte).toString("base64url");
const binding: CredentialBinding = {
  principalKey: "a".repeat(32),
  policyRevision: "family-v2",
  keyVersion: "2026-09",
  generation: 1,
};

test("credential envelopes round-trip and bind every identity field", async () => {
  const credentials = { username: " person@example.test ", password: " keep spaces " };
  const envelope = await encryptCredentials(credentials, binding, key(1));
  assert.deepEqual(await decryptCredentials(envelope, binding, key(1)), {
    username: "person@example.test",
    password: " keep spaces ",
  });
  for (const changed of [
    { ...binding, principalKey: "b".repeat(32) },
    { ...binding, policyRevision: "family-v3" },
    { ...binding, keyVersion: "next" },
    { ...binding, generation: 2 },
  ]) await assert.rejects(decryptCredentials(envelope, changed, key(1)), /Credential envelope is invalid/u);
  await assert.rejects(decryptCredentials(envelope, binding, key(2)), /Credential envelope is invalid/u);
});

test("credential envelopes reject tampering, malformed sizes, and unsafe input generically", async () => {
  const username = "sentinel-user@example.test";
  const password = "sentinel-private-value";
  const envelope = await encryptCredentials({ username, password }, binding, key(1));
  assert.doesNotMatch(JSON.stringify(envelope), /sentinel-user|sentinel-private-value/u);
  for (const value of [
    { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -1)}A` },
    { ...envelope, nonce: "short" },
    { ...envelope, ciphertext: "A".repeat(2_049) },
    { ...envelope, extra: "field" },
  ]) await assert.rejects(async () => {
    try { await decryptCredentials(value, binding, key(1)); } catch (error) {
      assert.doesNotMatch(String(error), /sentinel-user|sentinel-private-value|nonce|ciphertext/u);
      throw error;
    }
  }, /^Error: Credential envelope is invalid\.$/u);
  await assert.rejects(
    encryptCredentials({ username: "person@example.test", password: "" }, binding, key(1)),
    /^Error: Credential envelope is invalid\.$/u,
  );
});
