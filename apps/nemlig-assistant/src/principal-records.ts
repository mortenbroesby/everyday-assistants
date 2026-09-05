import type { CredentialEnvelope } from "./credential-envelope.js";
import { admitUsage, type AdmissionLimits, type AdmissionPrincipal, type AdmissionResult, type TierAdmissionPolicy, type UsageState } from "./cloudflare-usage.js";
import type { OperationClass } from "./cloudflare-gateway.js";

export const MAX_ACCEPTED_PRINCIPALS = 15;

export interface PrincipalRecord {
  subject: string;
  principal_key: string;
  tier: 1;
  status: "pending" | "enabled" | "disabled" | "revoked";
  organization_id: string;
  invitation_id_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialRecord {
  generation: number;
  envelope: CredentialEnvelope;
  created_at: string;
  updated_at: string;
}

export interface PrincipalStorage {
  transaction<T>(callback: () => Promise<T>): Promise<T>;
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

const invalid = (): never => { throw new Error("Principal record request is invalid."); };
const encoder = new TextEncoder();

const digest = async (value: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const subjectKey = async (subject: string): Promise<string> => `principal:subject:${await digest(subject)}`;
const credentialKey = (principalKey: string): string => `credential:${principalKey}`;
const validSubject = (value: string): boolean => value.trim() === value && value.length > 0 && value.length <= 500;
const validPrincipalKey = (value: string): boolean => /^[A-Za-z0-9_-]{32,64}$/u.test(value);
const validOrganization = (value: string): boolean => /^org_[A-Za-z0-9]{8,64}$/u.test(value);
const validHash = (value: string): boolean => /^[0-9a-f]{64}$/u.test(value);

const randomPrincipalKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

export async function findPrincipalRecord(storage: PrincipalStorage, subject: string): Promise<PrincipalRecord | undefined> {
  if (!validSubject(subject)) return undefined;
  return storage.get<PrincipalRecord>(await subjectKey(subject));
}

export async function registerInvitedPrincipal(
  storage: PrincipalStorage,
  input: { subject: string; organizationId: string; invitationIdHash: string },
  now = new Date(),
): Promise<PrincipalRecord> {
  if (!validSubject(input.subject) || !validOrganization(input.organizationId) || !validHash(input.invitationIdHash)) return invalid();
  const key = await subjectKey(input.subject);
  return storage.transaction(async () => {
    const existing = await storage.get<PrincipalRecord>(key);
    if (existing && existing.organization_id === input.organizationId && existing.status !== "revoked") return existing;
    const count = await storage.get<number>("accepted-principal-count") ?? 0;
    if (!existing && count >= MAX_ACCEPTED_PRINCIPALS) throw new Error("Principal capacity is unavailable.");
    const timestamp = now.toISOString();
    const record: PrincipalRecord = {
      subject: input.subject,
      principal_key: randomPrincipalKey(),
      tier: 1,
      status: "pending",
      organization_id: input.organizationId,
      invitation_id_hash: input.invitationIdHash,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await storage.put(key, record);
    if (!existing) {
      await storage.put("accepted-principal-count", count + 1);
      const index = await storage.get<string[]>("accepted-principal-index") ?? [];
      await storage.put("accepted-principal-index", [...index, key]);
    }
    return record;
  });
}

export async function listPrincipalRecords(storage: PrincipalStorage): Promise<PrincipalRecord[]> {
  const keys = await storage.get<string[]>("accepted-principal-index") ?? [];
  if (keys.length > MAX_ACCEPTED_PRINCIPALS || keys.some((key) => !/^principal:subject:[0-9a-f]{64}$/u.test(key))) return [];
  const records = await Promise.all(keys.map((key) => storage.get<PrincipalRecord>(key)));
  return records.filter((record): record is PrincipalRecord => Boolean(record));
}

export async function setPrincipalStatus(
  storage: PrincipalStorage,
  subject: string,
  status: "enabled" | "disabled" | "revoked",
  prerequisitesPassed = false,
  now = new Date(),
): Promise<PrincipalRecord | undefined> {
  const key = await subjectKey(subject);
  return storage.transaction(async () => {
    const existing = await storage.get<PrincipalRecord>(key);
    if (!existing || existing.status === "revoked") return undefined;
    if (status === "enabled" && (!prerequisitesPassed || !await storage.get(credentialKey(existing.principal_key)))) return invalid();
    const record = { ...existing, status, updated_at: now.toISOString() };
    await storage.put(key, record);
    if (status === "revoked") await storage.delete(credentialKey(existing.principal_key));
    return record;
  });
}

export async function getCredentialRecord(
  storage: PrincipalStorage,
  principal: Pick<PrincipalRecord, "principal_key">,
): Promise<CredentialRecord | undefined> {
  if (!validPrincipalKey(principal.principal_key)) return undefined;
  const record = await storage.get<CredentialRecord>(credentialKey(principal.principal_key));
  return record?.envelope.principal_key === principal.principal_key ? record : undefined;
}

export async function replaceCredentialRecord(
  storage: PrincipalStorage,
  principal: Pick<PrincipalRecord, "principal_key">,
  envelope: CredentialEnvelope,
  validated: boolean,
  now = new Date(),
): Promise<CredentialRecord | undefined> {
  if (!validated) return getCredentialRecord(storage, principal);
  if (!validPrincipalKey(principal.principal_key) || envelope.principal_key !== principal.principal_key) return invalid();
  return storage.transaction(async () => {
    const key = credentialKey(principal.principal_key);
    const existing = await storage.get<CredentialRecord>(key);
    const generation = (existing?.generation ?? 0) + 1;
    if (envelope.generation !== generation) return invalid();
    const timestamp = now.toISOString();
    const record: CredentialRecord = {
      generation,
      envelope,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    await storage.put(key, record);
    return record;
  });
}

export async function revokeCredentialRecord(
  storage: PrincipalStorage,
  principal: Pick<PrincipalRecord, "principal_key">,
): Promise<boolean> {
  if (!validPrincipalKey(principal.principal_key)) return false;
  return storage.delete(credentialKey(principal.principal_key));
}

export async function admitPrincipalRequest(
  storage: PrincipalStorage,
  operation: OperationClass,
  limits: AdmissionLimits,
  principal: AdmissionPrincipal,
  policy: TierAdmissionPolicy,
  credentialRequired: boolean,
  now = new Date(),
): Promise<AdmissionResult> {
  return storage.transaction(async () => {
    const admitted = admitUsage(await storage.get<UsageState>("usage"), operation, limits, principal, {
      ...policy,
      principalKeys: [...new Set([...policy.principalKeys, principal.principalKey])],
    }, now);
    if (!admitted.admitted) {
      await storage.put("usage", admitted.state);
      return admitted;
    }
    const credential = credentialRequired
      ? await storage.get<CredentialRecord>(credentialKey(principal.principalKey))
      : undefined;
    if (credentialRequired && (!credential || credential.envelope.principal_key !== principal.principalKey)) {
      return { admitted: false, status: 409, reason: "credential_required", state: admitted.state };
    }
    await storage.put("usage", admitted.state);
    return { ...admitted, ...(credential ? { credential: credential.envelope } : {}) };
  });
}

interface ValidationWindow { minute: string; count: number }
export async function consumeValidationRate(
  storage: PrincipalStorage,
  principalKey: string,
  perPrincipalLimit: number,
  globalLimit: number,
  now = new Date(),
): Promise<boolean> {
  if (!validPrincipalKey(principalKey) || !Number.isSafeInteger(perPrincipalLimit) || perPrincipalLimit < 1
    || !Number.isSafeInteger(globalLimit) || globalLimit < perPrincipalLimit) return false;
  const minute = now.toISOString().slice(0, 16);
  return storage.transaction(async () => {
    const current = (value: ValidationWindow | undefined): ValidationWindow => value?.minute === minute ? value : { minute, count: 0 };
    const principal = current(await storage.get<ValidationWindow>(`validation:${principalKey}`));
    const global = current(await storage.get<ValidationWindow>("validation:global"));
    if (principal.count >= perPrincipalLimit || global.count >= globalLimit) return false;
    principal.count += 1;
    global.count += 1;
    await storage.put(`validation:${principalKey}`, principal);
    await storage.put("validation:global", global);
    return true;
  });
}

export async function consumePortalCsrf(storage: PrincipalStorage, subject: string, csrf: string, expiresAt: number): Promise<boolean> {
  if (!validSubject(subject) || !/^[A-Za-z0-9_-]{32}$/u.test(csrf) || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
  const key = `portal-csrf:${await digest(subject)}`;
  const hash = await digest(csrf);
  return storage.transaction(async () => {
    const current = (await storage.get<Array<{ hash: string; expiresAt: number }>>(key) ?? [])
      .filter((entry) => entry.expiresAt > Date.now());
    if (current.some((entry) => entry.hash === hash)) return false;
    await storage.put(key, [...current, { hash, expiresAt }].slice(-32));
    return true;
  });
}
