import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseCurrentDeployment } from "./production-deploy.js";

const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const maxPages = 100;

export interface WorkerVersion {
  id: string;
  createdOn: string;
}

export interface WorkerVersionRetentionPlan {
  cutoff: string;
  protectedIds: string[];
  candidates: WorkerVersion[];
}

export interface WorkerVersionRetentionReport {
  policy: "worker-version-age";
  cutoff: string;
  listed: number;
  protected: string[];
  deleted: string[];
  alreadyAbsent: string[];
  cleanupComplete: boolean;
}

const fail = (reason: string): never => { throw new Error(`worker_version_retention_${reason}`); };

const validTimestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function parseWorkerVersionsPage(raw: unknown): { versions: WorkerVersion[]; page: number; totalPages: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("page_invalid");
  const root = raw as Record<string, unknown>;
  if (root.success !== true || !Array.isArray(root.result) || !root.result_info
    || typeof root.result_info !== "object" || Array.isArray(root.result_info)) return fail("page_invalid");
  const info = root.result_info as Record<string, unknown>;
  if (!Number.isSafeInteger(info.page) || !Number.isSafeInteger(info.total_pages)
    || (info.page as number) < 1 || (info.total_pages as number) < (info.page as number)) return fail("pagination_invalid");
  const versions = (root.result as unknown[]).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("version_invalid");
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || !versionId.test(item.id) || !validTimestamp(item.created_on)) return fail("version_invalid");
    return { id: item.id, createdOn: new Date(item.created_on).toISOString() };
  });
  return { versions, page: info.page as number, totalPages: info.total_pages as number };
}

export function parseProtectedVersionIds(raw: string | undefined): string[] {
  if (!raw) return [];
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (values.some((value) => !versionId.test(value))) return fail("protected_id_invalid");
  return [...new Set(values)];
}

export function planWorkerVersionRetention(
  versions: readonly WorkerVersion[],
  now: string,
  protectedIds: readonly string[],
): WorkerVersionRetentionPlan {
  if (!validTimestamp(now)) return fail("cutoff_invalid");
  const seen = new Set<string>();
  const normalized = versions.map((version) => ({ ...version, createdOn: validTimestamp(version.createdOn) ? new Date(version.createdOn).toISOString() : version.createdOn }));
  for (const version of normalized) {
    if (!versionId.test(version.id) || !validTimestamp(version.createdOn) || seen.has(version.id)) return fail("version_invalid");
    seen.add(version.id);
  }
  const cutoff = new Date(Date.parse(now) - 48 * 60 * 60 * 1000).toISOString();
  const protectedSet = new Set(protectedIds);
  if ([...protectedSet].some((id) => !versionId.test(id))) return fail("protected_id_invalid");
  return {
    cutoff,
    protectedIds: [...protectedSet].sort(),
    candidates: normalized
      .filter((version) => !protectedSet.has(version.id) && version.createdOn < cutoff)
      .sort((left, right) => left.createdOn.localeCompare(right.createdOn) || left.id.localeCompare(right.id)),
  };
}

export async function executeWorkerVersionRetention(
  plan: WorkerVersionRetentionPlan,
  dependencies: {
    list: () => Promise<readonly WorkerVersion[]>;
    protectedIds: () => Promise<readonly string[]>;
    delete: (id: string) => Promise<void>;
  },
): Promise<WorkerVersionRetentionReport> {
  const deleted: string[] = [];
  const alreadyAbsent: string[] = [];
  for (const candidate of plan.candidates) {
    const current = await dependencies.list();
    const currentProtected = new Set(await dependencies.protectedIds());
    const fresh = current.find(({ id }) => id === candidate.id);
    if (!fresh) {
      alreadyAbsent.push(candidate.id);
      continue;
    }
    if (currentProtected.has(candidate.id) || fresh.createdOn >= plan.cutoff) return fail("state_changed");
    await dependencies.delete(candidate.id);
    const after = await dependencies.list();
    if (after.some(({ id }) => id === candidate.id)) return fail("delete_readback_uncertain");
    deleted.push(candidate.id);
  }
  const remaining = await dependencies.list();
  const finalProtected = new Set(await dependencies.protectedIds());
  const incomplete = remaining.some(({ id, createdOn }) => !finalProtected.has(id) && createdOn < plan.cutoff);
  return {
    policy: "worker-version-age",
    cutoff: plan.cutoff,
    listed: remaining.length,
    protected: [...finalProtected].sort(),
    deleted,
    alreadyAbsent,
    cleanupComplete: !incomplete,
  };
}

interface ApiPage {
  versions: WorkerVersion[];
  page: number;
  totalPages: number;
}

export async function collectWorkerVersions(
  fetcher: (page: number) => Promise<unknown>,
): Promise<WorkerVersion[]> {
  const all: WorkerVersion[] = [];
  const seen = new Set<string>();
  let totalPages = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const current: ApiPage = parseWorkerVersionsPage(await fetcher(page));
    if (current.page !== page || (totalPages !== 0 && current.totalPages !== totalPages)) return fail("pagination_changed");
    totalPages = current.totalPages;
    for (const version of current.versions) {
      if (seen.has(version.id)) return fail("pagination_duplicate");
      seen.add(version.id);
      all.push(version);
    }
    if (page === totalPages) return all;
  }
  return fail("pagination_incomplete");
}

const command = (args: string[], env: NodeJS.ProcessEnv): Promise<string> => new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["exec", "wrangler", ...args], { env, stdio: ["ignore", "pipe", "ignore"] });
  let output = "";
  child.stdout?.on("data", (chunk: unknown) => { output += String(chunk); });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve(output) : reject(new Error("worker_version_retention_command_failed")));
});

const api = async (account: string, worker: string, token: string, page: number, signal: AbortSignal): Promise<unknown> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${worker}/versions?page=${page}&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal,
  });
  if (!response.ok) return fail("provider_read_failed");
  try { return await response.json(); } catch { return fail("provider_response_invalid"); }
};

const main = async (): Promise<void> => {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const worker = "nemlig-mcp-cloudflare-production";
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token) return fail("environment_invalid");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600_000);
  try {
    const versions = await collectWorkerVersions((page) => api(account, worker, token, page, controller.signal));
    const readActive = async (): Promise<string> => parseCurrentDeployment(await command(["deployments", "list", "--env", "production", "--json"], process.env)).version;
    const active = await readActive();
    const protectedIds = [active, ...parseProtectedVersionIds(process.env.NEMLIG_WORKER_VERSION_RECOVERY_IDS)];
    const plan = planWorkerVersionRetention(versions, new Date().toISOString(), protectedIds);
    if (process.env.NEMLIG_WORKER_VERSION_RETENTION_DRY_RUN === "true") {
      console.log(JSON.stringify({ policy: "worker-version-age", cutoff: plan.cutoff, listed: versions.length, protected: plan.protectedIds, candidates: plan.candidates.map(({ id }) => id), cleanupComplete: false, dryRun: true }));
      return;
    }
    const report = await executeWorkerVersionRetention(plan, {
      list: () => collectWorkerVersions((page) => api(account, worker, token, page, controller.signal)),
      protectedIds: async () => [await readActive(), ...parseProtectedVersionIds(process.env.NEMLIG_WORKER_VERSION_RECOVERY_IDS)],
      delete: async (id) => {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/workers/${worker}/versions/${id}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok) return fail("delete_uncertain");
      },
    });
    console.log(JSON.stringify(report));
  } finally {
    clearTimeout(timer);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error && /^worker_version_retention_[a-z0-9_]+$/u.test(error.message)
      ? error.message : "worker_version_retention_failed";
    console.error(message);
    console.log(JSON.stringify({ policy: "worker-version-age", outcome: "failed", failure: message.replace(/^worker_version_retention_/u, "") }));
    process.exitCode = 1;
  });
}
