import type { Credentials } from "./config.js";

export interface CredentialBinding {
  principalKey: string;
  policyRevision: string;
  keyVersion: string;
  generation: number;
}

export interface CredentialEnvelope {
  schema_version: 1;
  principal_key: string;
  policy_revision: string;
  key_version: string;
  generation: number;
  nonce: string;
  ciphertext: string;
}

const invalid = (): never => { throw new Error("Credential envelope is invalid."); };
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const base64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const bytes = (value: string, maximum: number): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > maximum) return invalid();
  try {
    const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4));
    const result = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) result[index] = decoded.charCodeAt(index);
    return result;
  } catch {
    return invalid();
  }
};

const validateBinding = (binding: CredentialBinding): void => {
  if (!/^[A-Za-z0-9_-]{32,64}$/u.test(binding.principalKey)
    || !/^[A-Za-z0-9._-]{1,64}$/u.test(binding.policyRevision)
    || !/^[A-Za-z0-9._-]{1,32}$/u.test(binding.keyVersion)
    || !Number.isSafeInteger(binding.generation) || binding.generation < 1) invalid();
};

const additionalData = (binding: CredentialBinding): Uint8Array<ArrayBuffer> => encoder.encode(JSON.stringify({
  schema_version: 1,
  principal_key: binding.principalKey,
  policy_revision: binding.policyRevision,
  key_version: binding.keyVersion,
  generation: binding.generation,
}));

const importKey = async (encoded: string): Promise<CryptoKey> => {
  const raw = bytes(encoded, 64);
  if (raw.byteLength !== 32) return invalid();
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const validateCredentials = (value: unknown): Credentials => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  const username = record.username;
  const password = record.password;
  if (Object.keys(record).sort().join(",") !== "password,username") return invalid();
  if (typeof username !== "string" || username.trim().length < 1 || username.length > 320) return invalid();
  if (typeof password !== "string" || password.length < 1 || password.length > 1_024) return invalid();
  return { username: username.trim(), password };
};

export async function encryptCredentials(
  credentials: Credentials,
  binding: CredentialBinding,
  encodedKey: string,
): Promise<CredentialEnvelope> {
  validateBinding(binding);
  const valid = validateCredentials(credentials);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: additionalData(binding), tagLength: 128 },
    await importKey(encodedKey),
    encoder.encode(JSON.stringify(valid)),
  );
  return {
    schema_version: 1,
    principal_key: binding.principalKey,
    policy_revision: binding.policyRevision,
    key_version: binding.keyVersion,
    generation: binding.generation,
    nonce: base64url(nonce),
    ciphertext: base64url(new Uint8Array(ciphertext)),
  };
}

export async function decryptCredentials(
  value: unknown,
  binding: CredentialBinding,
  encodedKey: string,
): Promise<Credentials> {
  try {
    validateBinding(binding);
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
    const envelope = value as Record<string, unknown>;
    if (Object.keys(envelope).sort().join(",") !== "ciphertext,generation,key_version,nonce,policy_revision,principal_key,schema_version"
      || envelope.schema_version !== 1
      || envelope.principal_key !== binding.principalKey
      || envelope.policy_revision !== binding.policyRevision
      || envelope.key_version !== binding.keyVersion
      || envelope.generation !== binding.generation
      || typeof envelope.nonce !== "string" || typeof envelope.ciphertext !== "string") return invalid();
    const nonce = bytes(envelope.nonce, 16);
    const ciphertext = bytes(envelope.ciphertext, 2_048);
    if (nonce.byteLength !== 12 || ciphertext.byteLength < 17 || ciphertext.byteLength > 1_500) return invalid();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: additionalData(binding), tagLength: 128 },
      await importKey(encodedKey),
      ciphertext,
    );
    return validateCredentials(JSON.parse(decoder.decode(plaintext)));
  } catch {
    return invalid();
  }
}
