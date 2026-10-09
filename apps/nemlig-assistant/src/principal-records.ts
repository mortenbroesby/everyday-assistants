import type { CredentialEnvelope } from './credential-envelope.js';
import type { Principal } from './principal-policy.js';

export interface AdmissionPrincipal {
  principalKey: string;
}
export interface AdmissionPolicy {
  revision: string;
}
export type AdmissionResult =
  | { admitted: true; credential?: CredentialEnvelope }
  | { admitted: false; status: 409; reason: 'credential_required' };

export interface PrincipalRecord {
  subject: string;
  principal_key: string;
  status: 'pending' | 'enabled' | 'disabled' | 'revoked';
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

const invalid = (): never => {
  throw new Error('Principal record request is invalid.');
};
const encoder = new TextEncoder();

const digest = async (value: string): Promise<string> => {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const subjectKey = async (subject: string): Promise<string> =>
  `principal:subject:${await digest(subject)}`;
const credentialKey = (principalKey: string): string =>
  `credential:${principalKey}`;
const validSubject = (value: string): boolean =>
  value.trim() === value && value.length > 0 && value.length <= 500;
const validPrincipalKey = (value: string): boolean =>
  /^[A-Za-z0-9_-]{32,64}$/u.test(value);

export async function findPrincipalRecord(
  storage: PrincipalStorage,
  subject: string,
): Promise<PrincipalRecord | undefined> {
  if (!validSubject(subject)) {
    return undefined;
  }
  return storage.get<PrincipalRecord>(await subjectKey(subject));
}

export async function setPrincipalStatus(
  storage: PrincipalStorage,
  principal: Principal,
  status: 'enabled' | 'disabled' | 'revoked',
  prerequisitesPassed = false,
  now = new Date(),
): Promise<PrincipalRecord | undefined> {
  if (
    !validSubject(principal.subject) ||
    !validPrincipalKey(principal.principal_key)
  ) {
    return invalid();
  }
  const key = await subjectKey(principal.subject);
  return storage.transaction(async () => {
    const existing = await storage.get<PrincipalRecord>(key);
    if (
      existing?.principal_key &&
      existing.principal_key !== principal.principal_key
    ) {
      return invalid();
    }
    if (existing?.status === 'revoked') {
      return undefined;
    }
    if (
      status === 'enabled' &&
      (!principal.enabled ||
        !prerequisitesPassed ||
        !(await storage.get(credentialKey(principal.principal_key))))
    ) {
      return invalid();
    }
    const record: PrincipalRecord = {
      subject: principal.subject,
      principal_key: principal.principal_key,
      status,
      created_at: existing?.created_at ?? now.toISOString(),
      updated_at: now.toISOString(),
    };
    await storage.put(key, record);
    if (status === 'revoked') {
      await storage.delete(credentialKey(principal.principal_key));
    }
    return record;
  });
}

export async function getCredentialRecord(
  storage: PrincipalStorage,
  principal: Pick<PrincipalRecord, 'principal_key'>,
): Promise<CredentialRecord | undefined> {
  if (!validPrincipalKey(principal.principal_key)) {
    return undefined;
  }
  const record = await storage.get<CredentialRecord>(
    credentialKey(principal.principal_key),
  );
  return record?.envelope.principal_key === principal.principal_key
    ? record
    : undefined;
}

export async function replaceCredentialRecord(
  storage: PrincipalStorage,
  principal: Principal,
  envelope: CredentialEnvelope,
  validated: boolean,
  now = new Date(),
): Promise<CredentialRecord | undefined> {
  if (!validated) {
    return getCredentialRecord(storage, principal);
  }
  if (
    !principal.enabled ||
    !validSubject(principal.subject) ||
    !validPrincipalKey(principal.principal_key) ||
    envelope.principal_key !== principal.principal_key
  ) {
    return invalid();
  }
  return storage.transaction(async () => {
    const accessKey = await subjectKey(principal.subject);
    const access = await storage.get<PrincipalRecord>(accessKey);
    if (
      access &&
      (access.principal_key !== principal.principal_key ||
        access.status === 'disabled' ||
        access.status === 'revoked')
    ) {
      return invalid();
    }
    const key = credentialKey(principal.principal_key);
    const existing = await storage.get<CredentialRecord>(key);
    const generation = (existing?.generation ?? 0) + 1;
    if (envelope.generation !== generation) {
      return invalid();
    }
    const timestamp = now.toISOString();
    const record: CredentialRecord = {
      generation,
      envelope,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    await storage.put(key, record);
    await storage.put(accessKey, {
      subject: principal.subject,
      principal_key: principal.principal_key,
      status: 'enabled',
      created_at: access?.created_at ?? timestamp,
      updated_at: timestamp,
    } satisfies PrincipalRecord);
    return record;
  });
}

export async function revokeCredentialRecord(
  storage: PrincipalStorage,
  principal: Pick<PrincipalRecord, 'principal_key'>,
): Promise<boolean> {
  if (!validPrincipalKey(principal.principal_key)) {
    return false;
  }
  return storage.delete(credentialKey(principal.principal_key));
}

export async function admitPrincipalRequest(
  storage: PrincipalStorage,
  principal: AdmissionPrincipal,
  policy: AdmissionPolicy,
  credentialRequired: boolean,
): Promise<AdmissionResult> {
  return storage.transaction(async () => {
    const credential = credentialRequired
      ? await storage.get<CredentialRecord>(
          credentialKey(principal.principalKey),
        )
      : undefined;
    if (
      credentialRequired &&
      (!credential ||
        credential.envelope.principal_key !== principal.principalKey ||
        credential.envelope.policy_revision !== policy.revision ||
        credential.generation !== credential.envelope.generation)
    ) {
      return { admitted: false, status: 409, reason: 'credential_required' };
    }
    return {
      admitted: true,
      ...(credential ? { credential: credential.envelope } : {}),
    };
  });
}

export async function consumePortalCsrf(
  storage: PrincipalStorage,
  subject: string,
  csrf: string,
  expiresAt: number,
): Promise<boolean> {
  if (
    !validSubject(subject) ||
    !/^[A-Za-z0-9_-]{32}$/u.test(csrf) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return false;
  }
  const key = `portal-csrf:${await digest(subject)}`;
  const hash = await digest(csrf);
  return storage.transaction(async () => {
    const current = (
      (await storage.get<Array<{ hash: string; expiresAt: number }>>(key)) ?? []
    ).filter((entry) => entry.expiresAt > Date.now());
    if (current.some((entry) => entry.hash === hash)) {
      return false;
    }
    // Never evict an unexpired token: a retained signed cookie can replay it.
    await storage.put(key, [...current, { hash, expiresAt }]);
    return true;
  });
}
