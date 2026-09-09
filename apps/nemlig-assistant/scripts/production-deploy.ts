import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { issueServiceToken } from "./service-token.js";

const fullSha = /^[0-9a-f]{40}$/u;
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const remoteLeaseRef = "refs/heads/codex-lock/nemlig-production";
const productionRepository = "mortenbroesby/everyday-assistants";
const ciWorkflowName = "CI";
const ciWorkflowPath = ".github/workflows/ci.yml";
const customMcp = new URL("https://nemlig-mcp.broesby.dk/mcp");
const workersMcp = new URL("https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp");
export const productionDeployUsage = "pnpm --filter nemlig-assistant production:deploy -- preflight <40-character-main-commit> | [--service|--service-cutover] <40-character-main-commit> | finalize <operation-id> --evidence-saved --original-runner-stopped | inspect-recovery <operation-id> [--original-runner-stopped]";

export type VerifiedState = "unchanged" | "disabled" | "enabled" | "restored" | "unknown";

export interface DeploymentJournal {
  schema: 2;
  operationId: string;
  commit: string;
  ciRunId: number;
  releaseRunId: number | "local";
  releaseRunAttempt: number | "local";
  startedAt: string;
  completedAt?: string;
  startingVersion?: string;
  disabledVersion?: string;
  enabledVersion?: string;
  startingApplicationVersion?: number;
  disabledApplicationVersion?: number;
  enabledApplicationVersion?: number;
  startingConfigDigest?: string;
  startingEnabled?: boolean;
  startingContainerId?: string;
  startingImage?: string;
  disabledImage?: string;
  enabledImage?: string;
  checks: string[];
  lastVerifiedState: VerifiedState;
  rollback: "not_needed" | "attempted" | "restored" | "failed";
  outcome: "running" | "success" | "failed";
  failure?: string;
  remoteCommit?: string;
  transitions: JournalTransition[];
}

type JournalPhase = "disabled_deploy" | "enable_deploy" | "rollback";
type JournalKind = "intent" | "result";
interface JournalTransition {
  phase: JournalPhase;
  kind: JournalKind;
  at: string;
  version?: string;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  signal?: AbortSignal;
}

export type CommandRunner = (command: string, args: readonly string[], options?: RunOptions) => Promise<string>;

export interface DeployDependencies {
  repoRoot: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  fetcher: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
  operationId?: () => string;
  operationDeadlineMs?: number;
  stateRoot?: string;
  acceptanceMode?: "owner" | "service" | "service-cutover";
  issueServiceToken?: typeof issueServiceToken;
  signal?: AbortSignal;
  configReader?: (options: { config: string; env: "production" }) => Promise<unknown> | unknown;
}

interface CurrentDeployment {
  id: string;
  version: string;
}

interface VersionState {
  id: string;
  enabled: boolean;
  revision: string;
}

interface ContainerState {
  id: string;
  image: string;
  version: number;
}

interface EffectiveConfig {
  vars: Map<string, string>;
  secrets: string[];
  digest: string;
}

class DeployFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class CommandFailure extends DeployFailure {
  constructor(code: string, readonly status?: number) {
    super(code);
  }
}

const fail = (code: string): never => { throw new DeployFailure(code); };

const json = (raw: string, code: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return fail(code);
  }
};

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const operationId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const journalPhases = new Set<JournalPhase>(["disabled_deploy", "enable_deploy", "rollback"]);
const journalKinds = new Set<JournalKind>(["intent", "result"]);
const journalLimit = 8 * 1024;
const validReleaseRun = (value: number | "local") => value === "local" || (Number.isSafeInteger(value) && value >= 1);
const isoTime = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const imageDigest = /^sha256:[0-9a-f]{64}$/u;
const journalChecks = new Set(["source_and_auth_preflight", "exclusive_lease", "starting_state_recorded", "disabled_version", "disabled_routes", "container_inactive", "enabled_version", "image_reused", "edge_acceptance", "authenticated_read_only_acceptance", "service_fixture_acceptance", "live_acceptance_pending", "starting_version_restored"]);
const journalFailures = new Set(["service_cutover_required", "live_acceptance_required", "service_acceptance_not_ready", "service_token_unavailable", "owner_access_token_required", "github_repository_invalid", "source_revision_mismatch", "github_ci_workflow_invalid", "github_ci_invalid", "exact_head_ci_not_green", "github_environment_not_ready", "local_deployment_lease_unavailable", "remote_deployment_lease_unavailable", "remote_journal_invalid", "remote_journal_append_failed", "remote_journal_parent_invalid", "remote_deployment_lease_changed", "deployment_journal_invalid", "deployment_journal_oversized", "deployment_journal_write_failed", "cloudflare_deployment_drift", "cloudflare_upload_version_missing", "cloudflare_config_invalid", "cloudflare_runtime_safety_mismatch", "disabled_route_unavailable", "disabled_route_mismatch", "container_inactive_timeout", "container_instance_timeout", "container_image_changed_during_enable", "recovery_finalize_denied", "command_failed", "command_cancelled", "unexpected_failure"]);

const journalJson = (journal: DeploymentJournal): string => {
  if (!journal || typeof journal !== "object" || !Array.isArray(journal.checks) || !Array.isArray(journal.transitions)
    || !operationId.test(journal.operationId) || !fullSha.test(journal.commit) || !Number.isSafeInteger(journal.ciRunId) || journal.ciRunId < 1
    || !isoTime(journal.startedAt) || (journal.completedAt !== undefined && !isoTime(journal.completedAt))
    || !validReleaseRun(journal.releaseRunId) || !validReleaseRun(journal.releaseRunAttempt)
    || ((journal.releaseRunId === "local") !== (journal.releaseRunAttempt === "local"))
    || journal.transitions.length > 32
    || (journal.remoteCommit !== undefined && (typeof journal.remoteCommit !== "string" || !fullSha.test(journal.remoteCommit)))
    || (journal.startingVersion !== undefined && (typeof journal.startingVersion !== "string" || !versionId.test(journal.startingVersion)))
    || (journal.disabledVersion !== undefined && (typeof journal.disabledVersion !== "string" || !versionId.test(journal.disabledVersion)))
    || (journal.enabledVersion !== undefined && (typeof journal.enabledVersion !== "string" || !versionId.test(journal.enabledVersion)))
    || [journal.startingApplicationVersion, journal.disabledApplicationVersion, journal.enabledApplicationVersion].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    || (journal.startingConfigDigest !== undefined && (typeof journal.startingConfigDigest !== "string" || !/^[0-9a-f]{64}$/u.test(journal.startingConfigDigest)))
    || (journal.startingEnabled !== undefined && typeof journal.startingEnabled !== "boolean")
    || (journal.startingContainerId !== undefined && (typeof journal.startingContainerId !== "string" || !versionId.test(journal.startingContainerId)))
    || (journal.startingImage !== undefined && (typeof journal.startingImage !== "string" || !imageDigest.test(journal.startingImage)))
    || (journal.disabledImage !== undefined && (typeof journal.disabledImage !== "string" || !imageDigest.test(journal.disabledImage)))
    || (journal.enabledImage !== undefined && (typeof journal.enabledImage !== "string" || !imageDigest.test(journal.enabledImage)))) fail("deployment_journal_invalid");
  if (journal.checks.some((check) => !journalChecks.has(check)) || (journal.failure !== undefined && !journalFailures.has(journal.failure))) fail("deployment_journal_invalid");
  let nextPhase = 0;
  let expecting: JournalKind = "intent";
  for (const transition of journal.transitions) {
    if (!transition || typeof transition !== "object" || !journalPhases.has(transition.phase) || !journalKinds.has(transition.kind)
      || !isoTime(transition.at) || (transition.version !== undefined && (typeof transition.version !== "string" || !versionId.test(transition.version)))
      || Object.keys(transition).some((key) => !["phase", "kind", "at", "version"].includes(key))
      || transition.phase !== ["disabled_deploy", "enable_deploy", "rollback"][nextPhase]
      || transition.kind !== expecting) fail("deployment_journal_invalid");
    if (expecting === "intent") expecting = "result";
    else { expecting = "intent"; nextPhase += 1; }
  }
  const serialized = JSON.stringify(journal);
  if (Buffer.byteLength(serialized, "utf8") > journalLimit) fail("deployment_journal_oversized");
  return serialized;
};

export function parseDeploymentJournal(raw: string): DeploymentJournal {
  const value = object(json(raw, "deployment_journal_invalid"));
  const allowed = new Set(["schema", "operationId", "commit", "ciRunId", "releaseRunId", "releaseRunAttempt", "startedAt", "completedAt", "startingVersion", "disabledVersion", "enabledVersion", "startingApplicationVersion", "disabledApplicationVersion", "enabledApplicationVersion", "startingConfigDigest", "startingEnabled", "startingContainerId", "startingImage", "disabledImage", "enabledImage", "checks", "lastVerifiedState", "rollback", "outcome", "failure", "remoteCommit", "transitions"]);
  if (!value || Object.keys(value).some((key) => !allowed.has(key)) || value.schema !== 2
    || typeof value.operationId !== "string" || typeof value.commit !== "string" || typeof value.ciRunId !== "number" || typeof value.startedAt !== "string"
    || (value.releaseRunId !== "local" && typeof value.releaseRunId !== "number") || (value.releaseRunAttempt !== "local" && typeof value.releaseRunAttempt !== "number")
    || !Array.isArray(value.checks) || !Array.isArray(value.transitions)
    || !["unchanged", "disabled", "enabled", "restored", "unknown"].includes(value.lastVerifiedState as string)
    || !["not_needed", "attempted", "restored", "failed"].includes(value.rollback as string)
    || !["running", "success", "failed"].includes(value.outcome as string)) fail("deployment_journal_invalid");
  const journal = value as unknown as DeploymentJournal;
  journalJson(journal);
  return journal;
}

export function parseDeployArgs(argv: readonly string[]): string {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  if (values.length !== 1 || !fullSha.test(values[0] ?? "")) {
    fail(`usage: ${productionDeployUsage}`);
  }
  return values[0];
}

export function parseDeployCli(argv: readonly string[]): { help: true } | { help: false; commit: string } {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  return values.length === 1 && (values[0] === "--help" || values[0] === "-h")
    ? { help: true }
    : { help: false, commit: parseDeployArgs(values) };
}

export type RecoveryCli =
  | { help: true }
  | { help: false; command: "preflight"; commit: string }
  | { help: false; command: "deploy"; commit: string; acceptanceMode?: "service" | "service-cutover" }
  | { help: false; command: "finalize"; operation: string; evidenceSaved: true; originalRunnerStopped: true }
  | { help: false; command: "inspect-recovery"; operation: string; originalRunnerStopped: boolean };

/** Parses all recovery commands before any repository or provider access. */
export function parseProductionDeployCli(argv: readonly string[]): RecoveryCli {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  if (values.length === 1 && (values[0] === "--help" || values[0] === "-h")) return { help: true };
  if (values[0] === "finalize" && values.length === 4 && operationId.test(values[1] ?? "") && values[2] === "--evidence-saved" && values[3] === "--original-runner-stopped") {
    return { help: false, command: "finalize", operation: values[1]!, evidenceSaved: true, originalRunnerStopped: true };
  }
  if (values[0] === "inspect-recovery" && operationId.test(values[1] ?? "")
    && (values.length === 2 || (values.length === 3 && values[2] === "--original-runner-stopped"))) {
    return { help: false, command: "inspect-recovery", operation: values[1]!, originalRunnerStopped: values[2] === "--original-runner-stopped" };
  }
  if (values[0] === "preflight") return { help: false, command: "preflight", commit: parseDeployArgs(values.slice(1)) };
  if (values[0] === "--service-cutover") return { help: false, command: "deploy", commit: parseDeployArgs(values.slice(1)), acceptanceMode: "service-cutover" };
  if (values[0] === "--service") return { help: false, command: "deploy", commit: parseDeployArgs(values.slice(1)), acceptanceMode: "service" };
  return { help: false, command: "deploy", commit: parseDeployArgs(values) };
}

export function parseCurrentDeployment(raw: string): CurrentDeployment {
  const parsed = json(raw, "cloudflare_deployments_invalid");
  if (!Array.isArray(parsed) || parsed.length === 0) throw new DeployFailure("cloudflare_deployments_missing");
  const latest = [...parsed].map(object).filter((value): value is Record<string, unknown> => Boolean(value))
    .sort((left, right) => String(left.created_on ?? "").localeCompare(String(right.created_on ?? ""))).at(-1);
  if (!latest) throw new DeployFailure("cloudflare_deployment_ambiguous");
  const id = latest.id;
  const versions = latest.versions;
  if (typeof id !== "string" || !Array.isArray(versions) || versions.length !== 1) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  const deployed = object(versions[0]);
  const deployedId = deployed?.version_id;
  if (typeof deployedId !== "string" || !versionId.test(deployedId) || deployed?.percentage !== 100) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  return { id, version: deployedId };
}

const configPlainNames = ["MCP_DAILY_LIMIT", "MCP_EXPENSIVE_DAILY_LIMIT", "MCP_RATE_LIMIT", "MCP_EXPENSIVE_RATE_LIMIT", "MCP_AUTH_TIMEOUT_MS", "MCP_CONTROL_TIMEOUT_MS", "MCP_TOTAL_TIMEOUT_MS", "MCP_BACKEND_TIMEOUT_MS", "MCP_CREDENTIAL_ONBOARDING_ENABLED", "MCP_CREDENTIAL_RATE_LIMIT", "MCP_CREDENTIAL_GLOBAL_RATE_LIMIT", "NEMLIG_MCP_HTTP_HOST", "NEMLIG_MCP_HTTP_PORT", "NEMLIG_MCP_AUTH0_ISSUER", "NEMLIG_MCP_AUTH0_AUDIENCE", "NEMLIG_MCP_PUBLIC_URL", "NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "NEMLIG_MCP_SERVICE_CLIENT_ID"] as const;
const configPlainSet = new Set<string>(configPlainNames);
const requiredSecrets = new Set(["NEMLIG_MCP_PRINCIPALS"]);
const expectedDo = new Map([["NEMLIG_MCP_CONTAINER", "NemligMcpContainer"], ["NEMLIG_PLAN_STORAGE", "PlanStorage"]]);
const productionWorker = "nemlig-mcp-cloudflare-production";

const bindings = (resource: Record<string, unknown>): Map<string, Record<string, unknown>> => {
  const resources = object(resource.resources);
  const values = resources?.bindings;
  if (!Array.isArray(values)) throw new DeployFailure("cloudflare_version_bindings_invalid");
  const result = new Map<string, Record<string, unknown>>();
  for (const entry of values) {
    const value = object(entry) ?? fail("cloudflare_version_bindings_invalid");
    const name = typeof value.name === "string" ? value.name : fail("cloudflare_version_bindings_invalid");
    if (name.length === 0 || typeof value.type !== "string" || result.has(name)) {
      fail("cloudflare_version_bindings_invalid");
    }
    result.set(name, value);
  }
  return result;
};

const validateDo = (bindings: Iterable<Record<string, unknown>>): void => {
  const found = new Map<string, string>();
  for (const value of bindings) {
    if (value.type !== "durable_object_namespace") continue;
    const name = typeof value.name === "string" ? value.name : fail("cloudflare_runtime_safety_mismatch");
    const className = typeof value.class_name === "string" ? value.class_name : fail("cloudflare_runtime_safety_mismatch");
    if (found.has(name)
      || (value.script_name !== undefined && value.script_name !== productionWorker)
      || (value.environment !== undefined && value.environment !== "production")
      || (value.environment !== undefined && value.script_name === undefined)) fail("cloudflare_runtime_safety_mismatch");
    found.set(name, className);
  }
  if (found.size !== expectedDo.size || [...expectedDo].some(([name, className]) => found.get(name) !== className)) fail("cloudflare_runtime_safety_mismatch");
};

const effectiveConfig = (vars: Map<string, string>, secrets: Iterable<string>, requireSecrets = true): EffectiveConfig => {
  const normalized = new Map(vars);
  if (!normalized.has("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED")) normalized.set("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "false");
  if (!normalized.has("NEMLIG_MCP_SERVICE_CLIENT_ID")) normalized.set("NEMLIG_MCP_SERVICE_CLIENT_ID", "");
  const serviceEnabled = normalized.get("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED");
  const serviceClientId = normalized.get("NEMLIG_MCP_SERVICE_CLIENT_ID") ?? "";
  if (configPlainNames.filter((name) => name !== "NEMLIG_MCP_SERVICE_CLIENT_ID").some((name) => {
    const value = normalized.get(name);
    return typeof value !== "string" || value.length === 0 || value.length > 2048;
  }) || serviceClientId.length > 2048) fail("cloudflare_runtime_safety_mismatch");
  if (!["true", "false"].includes(normalized.get("MCP_CREDENTIAL_ONBOARDING_ENABLED") ?? "")) fail("cloudflare_runtime_safety_mismatch");
  if (!["true", "false"].includes(serviceEnabled ?? "")
    || (serviceEnabled === "true" && !/^[A-Za-z0-9_-]{1,128}$/u.test(serviceClientId))) fail("cloudflare_runtime_safety_mismatch");
  for (const name of ["MCP_DAILY_LIMIT", "MCP_EXPENSIVE_DAILY_LIMIT", "MCP_RATE_LIMIT", "MCP_EXPENSIVE_RATE_LIMIT", "MCP_AUTH_TIMEOUT_MS", "MCP_CONTROL_TIMEOUT_MS", "MCP_TOTAL_TIMEOUT_MS", "MCP_BACKEND_TIMEOUT_MS", "MCP_CREDENTIAL_RATE_LIMIT", "MCP_CREDENTIAL_GLOBAL_RATE_LIMIT"]) {
    const value = vars.get(name) ?? "";
    if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) fail("cloudflare_runtime_safety_mismatch");
  }
  try {
    const host = normalized.get("NEMLIG_MCP_HTTP_HOST") ?? "";
    const portText = normalized.get("NEMLIG_MCP_HTTP_PORT") ?? "";
    const port = Number(portText);
    if (!/^[\w.-]+$/u.test(host) || !/^[1-9]\d*$/u.test(portText) || !Number.isSafeInteger(port) || port > 65535) throw new Error();
    for (const name of ["NEMLIG_MCP_AUTH0_ISSUER", "NEMLIG_MCP_AUTH0_AUDIENCE", "NEMLIG_MCP_PUBLIC_URL"]) {
      const url = new URL(normalized.get(name) ?? "");
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
    }
  } catch { fail("cloudflare_runtime_safety_mismatch"); }
  const secretNames = [...secrets].sort();
  if (secretNames.some((name, index) => (index > 0 && name === secretNames[index - 1]) || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name))
    || (requireSecrets && [...requiredSecrets].some((name) => !secretNames.includes(name)))) fail("cloudflare_runtime_safety_mismatch");
  const canonical = JSON.stringify({ limits: [100, 8], vars: [...normalized].filter(([name]) => configPlainSet.has(name)).sort(([left], [right]) => left.localeCompare(right)), durableObjects: [...expectedDo].sort(([left], [right]) => left.localeCompare(right)), secrets: secretNames.map((name) => [name, "secret_text"]) });
  return { vars, secrets: secretNames, digest: createHash("sha256").update(canonical).digest("hex") };
};

const versionConfig = (raw: string): EffectiveConfig => {
  const parsed = object(json(raw, "cloudflare_version_invalid")) ?? fail("cloudflare_version_invalid");
  const resources = object(parsed.resources);
  const runtime = object(resources?.script_runtime);
  const limits = object(runtime?.limits);
  if (limits?.cpu_ms !== 100 || limits.subrequests !== 8) fail("cloudflare_runtime_safety_mismatch");
  const values = bindings(parsed);
  validateDo(values.values());
  const vars = new Map<string, string>();
  const secrets: string[] = [];
  for (const [name, value] of values) {
    if (configPlainSet.has(name) || name === "MCP_ENABLED" || name === "NEMLIG_MCP_REVISION") {
      if (value.type !== "plain_text") fail("cloudflare_runtime_safety_mismatch");
      const text = typeof value.text === "string" ? value.text : fail("cloudflare_runtime_safety_mismatch");
      vars.set(name, text);
    } else if (value.type === "secret_text") {
      secrets.push(name);
    } else if (value.type !== "durable_object_namespace") fail("cloudflare_runtime_safety_mismatch");
  }
  return effectiveConfig(vars, secrets);
};

export function parseVersionState(raw: string, expectedId?: string): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) throw new DeployFailure("cloudflare_version_mismatch");
  const id = parsed.id;
  if (typeof id !== "string" || !versionId.test(id) || (expectedId && id !== expectedId)) {
    throw new DeployFailure("cloudflare_version_mismatch");
  }
  const values = bindings(parsed);
  const enabled = values.get("MCP_ENABLED")?.text;
  const revision = values.get("NEMLIG_MCP_REVISION")?.text;
  if ((enabled !== "true" && enabled !== "false") || typeof revision !== "string" || !fullSha.test(revision)) {
    throw new DeployFailure("cloudflare_version_state_invalid");
  }
  return { id, enabled: enabled === "true", revision };
}

export function verifyCandidateVersion(raw: string, expectedId: string, commit: string, enabled: boolean): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) throw new DeployFailure("cloudflare_version_invalid");
  const state = parseVersionState(raw, expectedId);
  if (state.revision !== commit || state.enabled !== enabled) fail("cloudflare_candidate_state_mismatch");
  const resources = object(parsed.resources);
  const runtime = object(resources?.script_runtime);
  const limits = object(runtime?.limits);
  const containers = runtime?.containers;
  if (limits?.cpu_ms !== 100 || limits.subrequests !== 8 || !Array.isArray(containers) || containers.length !== 1
    || object(containers[0])?.class_name !== "NemligMcpContainer") fail("cloudflare_runtime_safety_mismatch");
  const values = bindings(parsed);
  const expectedText: Record<string, string> = {
    MCP_AUTH_TIMEOUT_MS: "5000",
    MCP_BACKEND_TIMEOUT_MS: "85000",
    MCP_CONTROL_TIMEOUT_MS: "3000",
    MCP_DAILY_LIMIT: "5000",
    MCP_EXPENSIVE_DAILY_LIMIT: "500",
    MCP_EXPENSIVE_RATE_LIMIT: "10",
    MCP_RATE_LIMIT: "60",
    MCP_TOTAL_TIMEOUT_MS: "90000",
  };
  for (const [name, text] of Object.entries(expectedText)) {
    if (values.get(name)?.text !== text) fail("cloudflare_runtime_safety_mismatch");
  }
  for (const name of ["NEMLIG_MCP_CONTAINER", "NEMLIG_PLAN_STORAGE", "NEMLIG_MCP_PRINCIPALS"]) {
    if (!values.has(name)) fail("cloudflare_runtime_safety_mismatch");
  }
  return state;
}

const verifyConfig = (raw: string, expected: EffectiveConfig): void => {
  if (versionConfig(raw).digest !== expected.digest) fail("cloudflare_runtime_safety_mismatch");
};

export function parseContainer(raw: string): ContainerState {
  const parsed = json(raw, "cloudflare_containers_invalid");
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new DeployFailure("cloudflare_container_ambiguous");
  const value = object(parsed[0]);
  if (!value) throw new DeployFailure("cloudflare_container_ambiguous");
  const id = value.id;
  const image = value.image;
  const version = value.version;
  if (typeof id !== "string" || !versionId.test(id) || typeof image !== "string" || !imageDigest.test(image)
    || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1
    || value.name !== "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production"
    || value.instances !== 1) throw new DeployFailure("cloudflare_container_ambiguous");
  return { id, image, version };
}

export function instancesInactive(raw: string): boolean {
  const parsed = json(raw, "cloudflare_instances_invalid");
  const instance = Array.isArray(parsed) && parsed.length === 1 ? object(parsed[0]) : undefined;
  return instance?.state === "inactive" && typeof instance.id === "string" && instance.id.length > 0
    && instance.name === "nemlig-production" && instance.version === null;
}

const deployedVersionFromOutput = (raw: string): string => {
  const id = raw.match(/Current Version ID:\s*([0-9a-f-]{36})/u)?.[1];
  return id && versionId.test(id) ? id : fail("cloudflare_upload_version_missing");
};

export const defaultRunner: CommandRunner = async (command, args, options = {}) => await new Promise<string>((resolvePromise, reject) => {
  if (options.signal?.aborted) {
    reject(new DeployFailure("command_cancelled"));
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const child = spawn(command, args, {
    cwd: options.cwd, env: options.env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let stderr = "";
  let overflow = false;
  let terminated = false;
  let finished = false;
  let terminatedGroup: Promise<void> | undefined;
  const clean = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", terminate);
  };
  const done = (error?: Error) => {
    if (finished) return;
    finished = true;
    clean();
    if (error) reject(error);
    else resolvePromise(output.trim());
  };
  const terminate = () => {
    if (terminated) return;
    terminated = true;
    try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGTERM"); } catch { /* already closed */ }
    terminatedGroup = new Promise((resolvePromise) => setTimeout(() => {
      try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL"); } catch { /* already closed */ }
      resolvePromise();
    }, 5_000));
  };
  controller.signal.addEventListener("abort", terminate, { once: true });
  child.stdout.on("data", (chunk: Buffer) => {
    if (output.length + chunk.length > 16 * 1024 * 1024) { overflow = true; controller.abort(); }
    else output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-64 * 1024); });
  child.on("error", () => done(new CommandFailure("command_failed")));
  child.on("close", (code) => {
    if (controller.signal.aborted) {
      void (terminatedGroup ?? Promise.resolve()).then(() => done(new DeployFailure(overflow ? "command_failed" : "command_cancelled")));
    }
    else if (code === 0) done();
    else done(new CommandFailure("command_failed", /HTTP 404\b/u.test(stderr) ? 404 : undefined));
  });
  if (options.input !== undefined) child.stdin.end(options.input);
  else child.stdin.end();
});

const runAt = (deps: DeployDependencies, cwd: string, command: string, args: readonly string[], options: RunOptions = {}) => {
  const signal = options.signal ?? deps.signal;
  signal?.throwIfAborted();
  return deps.run(command, args, { ...options, signal, cwd, env: { ...deps.env, ...options.env } });
};

const wrangler = (deps: DeployDependencies, args: readonly string[], timeoutMs = 30_000) =>
  runAt(deps, deps.packageRoot, "pnpm", ["exec", "wrangler", ...args, "--env", "production"], { timeoutMs });

const readCurrent = async (deps: DeployDependencies): Promise<CurrentDeployment> =>
  parseCurrentDeployment(await wrangler(deps, ["deployments", "list", "--json"]));

const readVersion = async (deps: DeployDependencies, id: string): Promise<string> =>
  await wrangler(deps, ["versions", "view", id, "--json"]);

const readContainer = async (deps: DeployDependencies): Promise<ContainerState> =>
  parseContainer(await wrangler(deps, ["containers", "list", "--json"]));

const readLocalConfig = async (deps: DeployDependencies): Promise<EffectiveConfig> => {
  const trusted = await realpath(resolve(deps.packageRoot, "wrangler.jsonc")).catch(() => fail("cloudflare_config_invalid"));
  let config: unknown;
  try {
    const reader = deps.configReader ?? (async ({ config: path, env }: { config: string; env: "production" }) => {
      const { unstable_readConfig } = await import("wrangler");
      return unstable_readConfig({ config: path, env }, { hideWarnings: true });
    });
    config = await reader({ config: trusted, env: "production" });
  } catch { fail("cloudflare_config_invalid"); }
  const value = object(config) ?? fail("cloudflare_config_invalid");
  if (typeof value.configPath !== "string" || typeof value.userConfigPath !== "string"
    || await realpath(value.configPath).catch(() => "") !== trusted || await realpath(value.userConfigPath).catch(() => "") !== trusted
    || value.name !== productionWorker || value.keep_vars !== true) fail("cloudflare_config_invalid");
  const limits = object(value.limits);
  const containers = value.containers;
  if (limits?.cpu_ms !== 100 || limits.subrequests !== 8 || !Array.isArray(containers) || containers.length !== 1) fail("cloudflare_config_invalid");
  const container = object((containers as unknown[])[0]);
  if (!container || container.class_name !== "NemligMcpContainer" || container.instance_type !== "lite" || container.max_instances !== 1
    || object(container.constraints)?.jurisdiction !== "eu") fail("cloudflare_config_invalid");
  const rawVars = object(value.vars) ?? fail("cloudflare_config_invalid");
  if (Object.keys(rawVars).some((name) => name !== "MCP_ENABLED" && !configPlainSet.has(name))) fail("cloudflare_config_invalid");
  const vars = new Map<string, string>();
  for (const [name, plain] of Object.entries(rawVars)) {
    vars.set(name, typeof plain === "string" ? plain : fail("cloudflare_config_invalid"));
  }
  const durable = object(value.durable_objects);
  const durableBindings = durable?.bindings;
  if (!Array.isArray(durableBindings)) fail("cloudflare_config_invalid");
  validateDo((durableBindings as unknown[]).map((entry) => {
    const binding = object(entry) ?? fail("cloudflare_config_invalid");
    return { ...binding, type: "durable_object_namespace" };
  }));
  return effectiveConfig(vars, [], false);
};

const candidateConfig = (local: EffectiveConfig, live: EffectiveConfig): EffectiveConfig => {
  const vars = new Map(local.vars);
  const onboarding = live.vars.get("MCP_CREDENTIAL_ONBOARDING_ENABLED");
  if (onboarding !== "true" && onboarding !== "false") fail("cloudflare_runtime_safety_mismatch");
  vars.set("MCP_CREDENTIAL_ONBOARDING_ENABLED", onboarding as string);
  for (const name of ["NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "NEMLIG_MCP_SERVICE_CLIENT_ID"]) {
    const value = live.vars.get(name);
    if (value !== undefined) vars.set(name, value);
  }
  return effectiveConfig(vars, live.secrets);
};

const deployVars = (config: EffectiveConfig, enabled: boolean, commit: string): string[] => [
  ...[...config.vars].filter(([name]) => configPlainSet.has(name)).sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, value]) => ["--var", `${name}:${value}`]),
  "--var", `MCP_ENABLED:${enabled}`, "--var", `NEMLIG_MCP_REVISION:${commit}`,
];

const writeJournal = async (path: string, journal: DeploymentJournal): Promise<void> => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${journalJson(journal)}\n`, { mode: 0o600 });
  await rename(temporary, path);
};

const acquireLocalLease = async (path: string, operation: string, commit: string): Promise<void> => {
  try {
    const handle = await open(path, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ operation, commit })}\n`);
    await handle.close();
  } catch {
    fail("local_deployment_lease_unavailable");
  }
};

const repoIdentity = async (deps: DeployDependencies): Promise<{ nameWithOwner: string; url: string }> => {
  const value = object(json(await runAt(deps, deps.repoRoot, "gh", ["repo", "view", "--json", "nameWithOwner,url"]), "github_repository_invalid"));
  if (!value || value.nameWithOwner !== productionRepository || typeof value.url !== "string") {
    throw new DeployFailure("github_repository_invalid");
  }
  return { nameWithOwner: value.nameWithOwner, url: value.url };
};

const ghJson = async (deps: DeployDependencies, repository: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
  const args = ["api", "--method", method, `repos/${repository}/${path}`];
  const options: RunOptions = {};
  if (body !== undefined) {
    args.push("--input", "-");
    options.input = JSON.stringify(body);
  }
  return object(json(await runAt(deps, deps.repoRoot, "gh", args, options), "remote_journal_invalid")) ?? fail("remote_journal_invalid");
};

const journalCommit = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal, parent?: string): Promise<string> => {
  const blob = await ghJson(deps, repository, "POST", "git/blobs", { content: Buffer.from(journalJson(journal)).toString("base64"), encoding: "base64" });
  if (typeof blob.sha !== "string" || !fullSha.test(blob.sha)) fail("remote_journal_invalid");
  const tree = await ghJson(deps, repository, "POST", "git/trees", { tree: [{ path: "journal.json", mode: "100644", type: "blob", sha: blob.sha }] });
  if (typeof tree.sha !== "string" || !fullSha.test(tree.sha)) fail("remote_journal_invalid");
  const commit = await ghJson(deps, repository, "POST", "git/commits", {
    message: `Nemlig production recovery ${journal.operationId}`,
    tree: tree.sha,
    ...(parent ? { parents: [parent] } : {}),
  });
  const commitSha = commit.sha;
  if (typeof commitSha !== "string" || !fullSha.test(commitSha)) fail("remote_journal_invalid");
  return commitSha as string;
};

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && (error as { status?: unknown }).status === 404;

const readRemoteHead = async (deps: DeployDependencies, repository: string): Promise<string | undefined> => {
  let value = "";
  try {
    value = await runAt(deps, deps.repoRoot, "gh", ["api", `repos/${repository}/git/ref/heads/codex-lock/nemlig-production`, "--jq", ".object.sha"]);
  } catch (error) {
    if (isNotFound(error)) return undefined;
    fail("remote_journal_invalid");
  }
  if (!fullSha.test(value)) fail("remote_journal_invalid");
  return value;
};

const acquireRemoteJournal = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<string> => {
  if (await readRemoteHead(deps, repository)) fail("remote_deployment_lease_unavailable");
  const root = await journalCommit(deps, repository, journal);
  try {
    await ghJson(deps, repository, "POST", "git/refs", { ref: remoteLeaseRef, sha: root });
    if (await readRemoteHead(deps, repository) !== root) fail("remote_deployment_lease_changed");
  } catch {
    fail("remote_deployment_lease_unavailable");
  }
  return root;
};

const appendRemoteJournal = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<void> => {
  const parent = journal.remoteCommit;
  if (!parent || !fullSha.test(parent)) fail("remote_journal_parent_invalid");
  if (await readRemoteHead(deps, repository) !== parent) fail("remote_journal_parent_invalid");
  const child = await journalCommit(deps, repository, journal, parent);
  try {
    await ghJson(deps, repository, "PATCH", "git/refs/heads/codex-lock/nemlig-production", { sha: child, force: false });
    const current = await readRemoteHead(deps, repository);
    if (current !== child) fail("remote_deployment_lease_changed");
  } catch {
    fail("remote_journal_append_failed");
  }
  journal.remoteCommit = child;
};

const readRemoteJournal = async (deps: DeployDependencies, repository: string): Promise<{ head: string; journal: DeploymentJournal }> => {
  const head = await readRemoteHead(deps, repository);
  if (!head) fail("remote_journal_invalid");
  const commit = await ghJson(deps, repository, "GET", `git/commits/${head}`);
  const tree = object(commit.tree);
  if (typeof tree?.sha !== "string" || !fullSha.test(tree.sha)) fail("remote_journal_invalid");
  const treeSha = (tree as Record<string, unknown>).sha as string;
  const entries = await ghJson(deps, repository, "GET", `git/trees/${treeSha}`);
  const entriesList = Array.isArray(entries.tree) ? entries.tree.map(object) : undefined;
  const entry = entriesList?.[0];
  if (!entriesList || entriesList.length !== 1 || entry?.path !== "journal.json" || entry.type !== "blob"
    || entry.mode !== "100644" || typeof entry.sha !== "string" || !fullSha.test(entry.sha)) fail("remote_journal_invalid");
  const blob = await ghJson(deps, repository, "GET", `git/blobs/${(entry as Record<string, unknown>).sha as string}`);
  const encodedLimit = 4 * Math.ceil(journalLimit / 3);
  const content = blob.content;
  if (blob.encoding !== "base64") fail("remote_journal_invalid");
  if (typeof content !== "string") fail("remote_journal_invalid");
  const encodedContent = content as string;
  if (encodedContent.length > encodedLimit * 2 || !/^[A-Za-z0-9+/=\n]+$/u.test(encodedContent)) fail("remote_journal_invalid");
  const encoded = encodedContent.replace(/\n/g, "");
  if (encoded.length > encodedLimit || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) fail("remote_journal_invalid");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length > journalLimit || decoded.toString("base64") !== encoded) fail("remote_journal_invalid");
  return { head: head as string, journal: parseDeploymentJournal(decoded.toString("utf8")) };
};

type RecoveryReason = "eligible" | "operation_mismatch" | "runner_not_stopped" | "pending_or_unknown" | "provider_drift" | "journal_invalid";
export interface RecoveryInspection {
  operation: string;
  originalRunnerStopped: boolean;
  cleanupEligible: boolean;
  reason: RecoveryReason;
  state: "enabled" | "disabled" | "restored" | "unknown";
}

interface RecoveryTarget {
  version: string;
  containerId: string;
  image: string;
  applicationVersion: number;
  configDigest: string;
  enabled?: boolean;
  state: "enabled" | "disabled" | "restored";
}

const expectedRecovery = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  if (!journal.startingConfigDigest || !journal.startingContainerId || typeof journal.startingEnabled !== "boolean") return undefined;
  const common = { containerId: journal.startingContainerId, configDigest: journal.startingConfigDigest };
  if (journal.outcome === "success" && journal.enabledVersion && journal.enabledImage && journal.enabledApplicationVersion) {
    return { ...common, version: journal.enabledVersion, image: journal.enabledImage, applicationVersion: journal.enabledApplicationVersion, enabled: true, state: "enabled" };
  }
  if (journal.lastVerifiedState === "restored" && journal.startingVersion && journal.startingImage && journal.startingApplicationVersion) {
    return { ...common, version: journal.startingVersion, image: journal.startingImage, applicationVersion: journal.startingApplicationVersion, enabled: journal.startingEnabled, state: "restored" };
  }
  if (journal.outcome === "failed" && journal.lastVerifiedState === "disabled" && journal.disabledVersion && journal.disabledImage && journal.disabledApplicationVersion) {
    return { ...common, version: journal.disabledVersion, image: journal.disabledImage, applicationVersion: journal.disabledApplicationVersion, enabled: false, state: "disabled" };
  }
  return undefined;
};

/** Metadata-only proof: four bounded reads, no instance wake or convergence retry. */
const verifyRecoveryTarget = async (deps: DeployDependencies, expected: RecoveryTarget): Promise<boolean> => {
  const current = await readCurrent(deps);
  const raw = await readVersion(deps, current.version);
  const state = parseVersionState(raw, current.version);
  verifyCandidateVersion(raw, current.version, state.revision, state.enabled);
  const container = await readContainer(deps);
  const instances = await wrangler(deps, ["containers", "instances", container.id, "--json"]);
  return current.version === expected.version && (expected.enabled === undefined || state.enabled === expected.enabled)
    && container.id === expected.containerId && container.image === expected.image && container.version === expected.applicationVersion
    && versionConfig(raw).digest === expected.configDigest
    && (instancesInactive(instances) || (state.enabled && runningInstanceMatches(instances, expected.applicationVersion)));
};

const knownTerminal = (journal: DeploymentJournal): boolean => {
  if (!journal.completedAt || journal.outcome === "running" || journal.lastVerifiedState === "unknown") return false;
  const result = journal.transitions.at(-1);
  if (result?.kind !== "result") return false;
  if (journal.outcome === "success") return journal.lastVerifiedState === "enabled" && result.phase === "enable_deploy"
    && result.version === journal.enabledVersion && ["enabled_version", "image_reused", "edge_acceptance"].every((check) => journal.checks.includes(check))
    && (journal.checks.includes("authenticated_read_only_acceptance") || journal.checks.includes("service_fixture_acceptance"));
  if (journal.lastVerifiedState === "disabled") return result.phase === "disabled_deploy" && result.version === journal.disabledVersion
    && ["disabled_routes", "container_inactive"].every((check) => journal.checks.includes(check));
  return journal.lastVerifiedState === "restored" && journal.rollback === "restored" && result.phase === "rollback"
    && result.version === journal.startingVersion && journal.checks.includes("starting_version_restored");
};

export async function inspectDeploymentRecovery(operation: string, deps: DeployDependencies, originalRunnerStopped = false): Promise<RecoveryInspection> {
  if (!operationId.test(operation)) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "operation_mismatch", state: "unknown" };
  try {
    const repo = await repoIdentity(deps);
    const { journal } = await readRemoteJournal(deps, repo.nameWithOwner);
    const expected = expectedRecovery(journal);
    if (journal.operationId !== operation) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "operation_mismatch", state: "unknown" };
    if ((journal.checks.includes("live_acceptance_pending") && await readAcceptedRevision(deps) !== journal.commit) || !knownTerminal(journal) || !expected) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "pending_or_unknown", state: "unknown" };
    if (!await verifyRecoveryTarget(deps, expected)) {
      return { operation, originalRunnerStopped, cleanupEligible: false, reason: "provider_drift", state: "unknown" };
    }
    if (!originalRunnerStopped) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "runner_not_stopped", state: expected.state };
    return { operation, originalRunnerStopped, cleanupEligible: true, reason: "eligible", state: expected.state };
  } catch {
    return { operation, originalRunnerStopped, cleanupEligible: false, reason: "journal_invalid", state: "unknown" };
  }
}

const releaseDeploymentLeases = async (
  deps: DeployDependencies,
  repository: string,
  remoteHead: string,
  operation: string,
  localLock?: string,
): Promise<boolean> => {
  if (await readRemoteHead(deps, repository) !== remoteHead) return false;
  await runAt(deps, deps.repoRoot, "gh", ["api", "--method", "DELETE", `repos/${repository}/git/refs/heads/codex-lock/nemlig-production`]);
  let lock = localLock;
  if (!lock) {
    const common = deps.stateRoot ?? await runAt(deps, deps.repoRoot, "git", ["rev-parse", "--git-common-dir"]);
    lock = join(isAbsolute(common) ? common : resolve(deps.repoRoot, common), "nemlig-production-deploy.lock");
  }
  try {
    const local = object(json(await readFile(lock, "utf8"), "recovery_finalize_denied"));
    if (local?.operation === operation) await unlink(lock);
  } catch { /* remote release remains authoritative */ }
  return true;
};

export async function finalizeDeploymentRecovery(operation: string, deps: DeployDependencies, evidenceSaved: boolean, originalRunnerStopped = false): Promise<boolean> {
  if (!operationId.test(operation) || !evidenceSaved || !originalRunnerStopped) return false;
  const repo = await repoIdentity(deps);
  const remote = await readRemoteJournal(deps, repo.nameWithOwner);
  const { journal } = remote;
  const expected = expectedRecovery(journal);
  if (journal.operationId !== operation || !knownTerminal(journal) || !expected
    || (journal.checks.includes("live_acceptance_pending") && await readAcceptedRevision(deps) !== journal.commit)) return false;
  if (!await verifyRecoveryTarget(deps, expected)) return false;
  // Compare the containing ref head, never journal.remoteCommit supplied by the blob.
  return releaseDeploymentLeases(deps, repo.nameWithOwner, remote.head, operation);
}

const verifySource = async (deps: DeployDependencies, commit: string, repo: { nameWithOwner: string; url: string }): Promise<number> => {
  await runAt(deps, deps.repoRoot, "gh", ["auth", "status", "-h", "github.com"]);
  await runAt(deps, deps.repoRoot, "git", ["-c", "credential.helper=!gh auth git-credential", "fetch", repo.url, "main:refs/remotes/origin/main"]);
  const [head, remote, status] = await Promise.all([
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "HEAD"]),
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "origin/main"]),
    runAt(deps, deps.repoRoot, "git", ["status", "--porcelain"]),
  ]);
  if (head !== commit || remote !== commit || status !== "") fail("source_revision_mismatch");
  const workflows = json(await runAt(deps, deps.repoRoot, "gh", [
    "workflow", "list", "--repo", repo.nameWithOwner, "--all", "--limit", "100", "--json", "id,name,path,state",
  ]), "github_ci_workflow_invalid");
  const matchingWorkflows = Array.isArray(workflows) ? workflows.map(object).filter((workflow) =>
    workflow?.name === ciWorkflowName && workflow.path === ciWorkflowPath && workflow.state === "active") : [];
  const workflowId = matchingWorkflows.length === 1 ? matchingWorkflows[0]?.id : undefined;
  if (typeof workflowId !== "number") fail("github_ci_workflow_invalid");
  const runs = json(await runAt(deps, deps.repoRoot, "gh", [
    "run", "list", "--repo", repo.nameWithOwner, "--commit", commit, "--workflow", String(workflowId), "--limit", "10",
    "--json", "conclusion,databaseId,event,headBranch,headSha,status,url,workflowDatabaseId,workflowName",
  ]), "github_ci_invalid");
  const trusted = Array.isArray(runs) ? runs.map(object).filter((run) =>
    run?.headSha === commit
    && run.event === "push"
    && run.headBranch === "main"
    && run.workflowName === ciWorkflowName
    && run.workflowDatabaseId === workflowId
    && typeof run.databaseId === "number").sort((left, right) => (right!.databaseId as number) - (left!.databaseId as number))[0] : undefined;
  if (!trusted) fail("exact_head_ci_not_green");
  const trustedRun = trusted as Record<string, unknown>;
  if (trustedRun.status !== "completed" || trustedRun.conclusion !== "success") {
    fail("exact_head_ci_not_green");
  }
  const run = object(json(await runAt(deps, deps.repoRoot, "gh", [
    "run", "view", String(trustedRun.databaseId), "--repo", repo.nameWithOwner, "--json", "jobs",
  ]), "github_ci_invalid"));
  const jobs = Array.isArray(run?.jobs) ? run.jobs.map(object).filter((job): job is Record<string, unknown> => Boolean(job)) : [];
  const verify = jobs.filter((job) => job.name === "verify");
  if (verify.length !== 1 || verify[0]?.status !== "completed" || verify[0]?.conclusion !== "success") fail("exact_head_ci_not_green");
  return trustedRun.databaseId as number;
};

const githubEnvironment = async (deps: DeployDependencies, repository: string, path: string): Promise<Record<string, unknown>> => {
  try {
    const value = json(await runAt(deps, deps.repoRoot, "gh", ["api", `repos/${repository}/${path}`]), "github_environment_not_ready");
    return object(value) ?? fail("github_environment_not_ready");
  } catch {
    return fail("github_environment_not_ready");
  }
};

const verifyGithubEnvironment = async (deps: DeployDependencies, repository: string): Promise<void> => {
  const environment = await githubEnvironment(deps, repository, "environments/nemlig-production");
  const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules.map(object) : [];
  if (rules.some((rule) => rule?.type !== "required_reviewers" && rule?.type !== "branch_policy")) fail("github_environment_not_ready");
  const requiredReviewers = rules.filter((rule) => rule?.type === "required_reviewers");
  const reviewers = requiredReviewers.length === 1 && Array.isArray(requiredReviewers[0]?.reviewers)
    ? requiredReviewers[0]!.reviewers.map(object) : [];
  const reviewer = reviewers.length === 1 ? reviewers[0] : undefined;
  const reviewerUser = object(reviewer?.reviewer);
  const branchPolicy = object(environment.deployment_branch_policy);
  if (environment.can_admins_bypass !== false || requiredReviewers[0]?.prevent_self_review !== false
    || branchPolicy?.protected_branches !== false || branchPolicy.custom_branch_policies !== true
    || reviewer?.type !== "User" || reviewerUser?.login !== "mortenbroesby") fail("github_environment_not_ready");
  const branches = await githubEnvironment(deps, repository, "environments/nemlig-production/deployment-branch-policies");
  const policies = Array.isArray(branches.branch_policies) ? branches.branch_policies.map(object) : [];
  if (policies.length !== 1 || policies[0]?.name !== "main" || policies[0]?.type !== "branch") fail("github_environment_not_ready");
};

/** Read-only exact-main CI and protected-environment proof for the deployment workflow. */
export async function preflightProductionDeploy(commit: string, deps: DeployDependencies): Promise<{ commit: string; ciRunId: number }> {
  if (!fullSha.test(commit)) fail("invalid_commit");
  const repo = await repoIdentity(deps);
  const ciRunId = await verifySource(deps, commit, repo);
  await verifyGithubEnvironment(deps, repo.nameWithOwner);
  return { commit, ciRunId };
}

const verifyDisabledRoutes = async (deps: DeployDependencies): Promise<void> => {
  for (const endpoint of [customMcp, workersMcp]) {
    const timeout = AbortSignal.timeout(10_000);
    const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
    const response = await deps.fetcher(endpoint, { signal })
      .catch(() => fail("disabled_route_unavailable"));
    if (response.status !== 503 || await response.text() !== "MCP temporarily disabled") fail("disabled_route_mismatch");
  }
};

const sleepAbortably = async (deps: DeployDependencies): Promise<void> => {
  if (!deps.signal) return await deps.sleep(5_000);
  await new Promise<void>((resolvePromise, reject) => {
    const abort = () => reject(new DeployFailure("command_cancelled"));
    deps.signal!.addEventListener("abort", abort, { once: true });
    void deps.sleep(5_000).then(() => {
      deps.signal!.removeEventListener("abort", abort);
      resolvePromise();
    }, (error) => {
      deps.signal!.removeEventListener("abort", abort);
      reject(error);
    });
  });
};

const waitForInactive = async (deps: DeployDependencies, applicationId: string): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    if (instancesInactive(await wrangler(deps, ["containers", "instances", applicationId, "--json"]))) return;
    await sleepAbortably(deps);
  }
  fail("container_inactive_timeout");
};

const runningInstanceMatches = (raw: string, expectedVersion: number): boolean => {
  const parsed = json(raw, "cloudflare_instances_invalid");
  if (!Array.isArray(parsed) || parsed.length !== 1) fail("cloudflare_instances_invalid");
  const instance = object((parsed as unknown[])[0]) ?? fail("cloudflare_instances_invalid");
  const { id, name, state, version } = instance;
  if (typeof id !== "string" || id.length === 0 || name !== "nemlig-production"
    || typeof state !== "string" || (version !== null && (!Number.isSafeInteger(version) || (version as number) < 1))) {
    fail("cloudflare_instances_invalid");
  }
  if (state === "running") {
    if (typeof version !== "number") return fail("cloudflare_instances_invalid");
    if (version > expectedVersion) return fail("cloudflare_deployment_drift");
    return version === expectedVersion;
  }
  if (state === "provisioning") return false;
  return fail("cloudflare_instances_invalid");
};

const waitForRunningInstance = async (deps: DeployDependencies, applicationId: string, expectedVersion: number): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    if (runningInstanceMatches(await wrangler(deps, ["containers", "instances", applicationId, "--json"]), expectedVersion)) return;
    if (attempt < 35) await sleepAbortably(deps);
  }
  fail("container_instance_timeout");
};

const verifyCurrent = async (deps: DeployDependencies, expected: string): Promise<void> => {
  if ((await readCurrent(deps)).version !== expected) fail("cloudflare_deployment_drift");
};

const verifyLeaseHead = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<void> => {
  if (!journal.remoteCommit || await readRemoteHead(deps, repository) !== journal.remoteCommit) fail("remote_deployment_lease_changed");
};

const rollback = async (deps: DeployDependencies, journal: DeploymentJournal, starting: VersionState, startingContainer: ContainerState): Promise<void> => {
  journal.rollback = "attempted";
  await wrangler(deps, ["rollback", starting.id, "--message", `Automated rollback after failed ${journal.commit.slice(0, 7)} release`, "--yes"], 120_000);
  if (!journal.startingConfigDigest || !await verifyRecoveryTarget(deps, {
    version: starting.id, containerId: startingContainer.id, image: startingContainer.image,
    applicationVersion: startingContainer.version, configDigest: journal.startingConfigDigest, enabled: starting.enabled, state: "restored",
  })) fail("cloudflare_deployment_drift");
  if (starting.enabled) {
    await runAt(deps, deps.packageRoot, "pnpm", ["production:probe"], {
      timeoutMs: 120_000,
      env: { NEMLIG_EXPECTED_REVISION: starting.revision },
    });
  } else {
    await verifyDisabledRoutes(deps);
  }
  journal.rollback = "restored";
  journal.lastVerifiedState = "restored";
  journal.checks.push("starting_version_restored");
};

const readAcceptedRevision = async (deps: DeployDependencies): Promise<string | null> => {
  try {
    const value = object(JSON.parse(await readFile(join(deps.packageRoot, "release", "production-cutover.json"), "utf8")));
    if (value?.schema !== 1 || Object.keys(value).some((key) => !["schema", "acceptedRevision"].includes(key))) return null;
    return typeof value.acceptedRevision === "string" && fullSha.test(value.acceptedRevision) ? value.acceptedRevision : null;
  } catch { return null; }
};

/** Only reviewed, previously accepted runtime can use the routine service gate. */
const verifyRoutineRelease = async (deps: DeployDependencies, commit: string): Promise<void> => {
  const accepted = await readAcceptedRevision(deps);
  if (!accepted) fail("service_cutover_required");
  try { await runAt(deps, deps.repoRoot, "git", ["merge-base", "--is-ancestor", accepted!, commit]); }
  catch { fail("service_cutover_required"); }
  const changed = await runAt(deps, deps.repoRoot, "git", ["diff", "--name-only", "-z", accepted!, commit]);
  for (const path of changed.split("\0").filter(Boolean)) {
    if (/^(?:docs\/|openspec\/)/u.test(path) || /\.md$/u.test(path) || /\.test\.(?:ts|mjs)$/u.test(path)
      || path === "apps/nemlig-assistant/release/production-cutover.json") continue;
    if (path === "apps/nemlig-assistant/package.json") {
      const versions = await Promise.all([accepted!, commit].map(async (ref) => {
        const value = object(json(await runAt(deps, deps.repoRoot, "git", ["show", `${ref}:${path}`]), "live_acceptance_required"));
        if (!value) fail("live_acceptance_required");
        delete value!.version;
        return JSON.stringify(value);
      }));
      if (versions[0] === versions[1]) continue;
    }
    fail("live_acceptance_required");
  }
};

export async function deployProduction(commit: string, inputDeps: DeployDependencies): Promise<DeploymentJournal> {
  if (!fullSha.test(commit)) fail("invalid_commit");
  const runIdText = inputDeps.env.GITHUB_RUN_ID;
  const runAttemptText = inputDeps.env.GITHUB_RUN_ATTEMPT;
  const decimal = /^[1-9]\d*$/u;
  const releaseRunId = runIdText === undefined && runAttemptText === undefined ? "local" : decimal.test(runIdText ?? "") ? Number(runIdText) : fail("github_ci_invalid");
  const releaseRunAttempt = runIdText === undefined && runAttemptText === undefined ? "local" : decimal.test(runAttemptText ?? "") ? Number(runAttemptText) : fail("github_ci_invalid");
  if ((releaseRunId !== "local" && !Number.isSafeInteger(releaseRunId)) || (releaseRunAttempt !== "local" && !Number.isSafeInteger(releaseRunAttempt))) fail("github_ci_invalid");
  const operationController = new AbortController();
  const abortOperation = () => operationController.abort();
  const inheritedSignal = inputDeps.signal;
  if (inheritedSignal?.aborted) abortOperation();
  else inheritedSignal?.addEventListener("abort", abortOperation, { once: true });
  const operationDeadline = setTimeout(abortOperation, Math.min(inputDeps.operationDeadlineMs ?? 25 * 60_000, 25 * 60_000));
  const service = inputDeps.env.GITHUB_ACTIONS === "true" || inputDeps.acceptanceMode === "service" || inputDeps.acceptanceMode === "service-cutover";
  // Do not read owner credentials or pass the machine secret to child commands.
  const env = service ? Object.fromEntries(Object.keys(inputDeps.env)
    .filter((name) => !["NEMLIG_MCP_ACCESS_TOKEN", "NEMLIG_MCP_SERVICE_CLIENT_SECRET", "NEMLIG_MCP_SERVICE_ACCESS_TOKEN"].includes(name))
    .map((name) => [name, inputDeps.env[name]])) : inputDeps.env;
  const deps: DeployDependencies = { ...inputDeps, env, signal: operationController.signal };
  let serviceToken: string | undefined;
  const journal: DeploymentJournal = {
    schema: 2,
    operationId: (deps.operationId ?? randomUUID)(),
    commit,
    ciRunId: 0,
    releaseRunId,
    releaseRunAttempt,
    startedAt: deps.now().toISOString(),
    checks: [],
    lastVerifiedState: "unchanged",
    rollback: "not_needed",
    outcome: "running",
    transitions: [],
  };
  let providerMutation = false;
  let mutationUncertain = false;
  let starting: VersionState | undefined;
  let startingContainer: ContainerState | undefined;
  let configured: EffectiveConfig | undefined;
  let repository = "";
  let journalPath = "";
  let lockPath = "";
  let transition: ((phase: JournalPhase, kind: JournalKind, version?: string) => Promise<void>) | undefined;

  try {
    deps.signal?.throwIfAborted();
    if (!service && !deps.env.NEMLIG_MCP_ACCESS_TOKEN?.trim()) fail("owner_access_token_required");
    const repo = await repoIdentity(deps);
    repository = repo.nameWithOwner;
    journal.ciRunId = await verifySource(deps, commit, repo);
    if (service) {
      if (deps.env.NEMLIG_CI_ACCEPTANCE_READY !== "true") fail("service_acceptance_not_ready");
      if (inputDeps.acceptanceMode !== "service-cutover") await verifyRoutineRelease(deps, commit);
      await verifyGithubEnvironment(deps, repository);
      try { serviceToken = await (deps.issueServiceToken ?? issueServiceToken)(inputDeps.env, { fetcher: inputDeps.fetcher, signal: deps.signal }); }
      catch { fail("service_token_unavailable"); }
    }
    const common = deps.stateRoot ?? await runAt(deps, deps.repoRoot, "git", ["rev-parse", "--git-common-dir"]);
    const stateRoot = isAbsolute(common) ? common : resolve(deps.repoRoot, common);
    await mkdir(join(stateRoot, "nemlig-production-deploy"), { recursive: true, mode: 0o700 });
    lockPath = join(stateRoot, "nemlig-production-deploy.lock");
    journalPath = join(stateRoot, "nemlig-production-deploy", "latest.json");
    await acquireLocalLease(lockPath, journal.operationId, commit);
    journal.remoteCommit = await acquireRemoteJournal(deps, repository, journal);
    try { await writeJournal(journalPath, journal); } catch { fail("deployment_journal_write_failed"); }

    if (await verifySource(deps, commit, repo) !== journal.ciRunId) fail("github_ci_invalid");
    const start = await readCurrent(deps);
    const startingRaw = await readVersion(deps, start.version);
    starting = parseVersionState(startingRaw, start.version);
    verifyCandidateVersion(startingRaw, starting.id, starting.revision, starting.enabled);
    const startingConfig = versionConfig(startingRaw);
    configured = candidateConfig(await readLocalConfig(deps), startingConfig);
    if (configured.digest !== startingConfig.digest) fail("cloudflare_runtime_safety_mismatch");
    if (service) {
      const clientId = inputDeps.env.NEMLIG_MCP_SERVICE_CLIENT_ID?.trim();
      if (!clientId || configured.vars.get("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED") !== "true"
        || configured.vars.get("NEMLIG_MCP_SERVICE_CLIENT_ID") !== clientId) fail("service_acceptance_not_ready");
    }
    startingContainer = await readContainer(deps);
    journal.startingVersion = starting.id;
    journal.startingContainerId = startingContainer.id;
    journal.startingImage = startingContainer.image;
    journal.startingApplicationVersion = startingContainer.version;
    journal.startingConfigDigest = startingConfig.digest;
    journal.startingEnabled = starting.enabled;
    journal.checks.push("source_and_auth_preflight", "exclusive_lease", "starting_state_recorded");
    try { await writeJournal(journalPath, journal); } catch { fail("deployment_journal_write_failed"); }

    transition = async (phase: JournalPhase, kind: JournalKind, version?: string): Promise<void> => {
      journal.transitions.push({ phase, kind, at: deps.now().toISOString(), ...(version ? { version } : {}) });
      try { await appendRemoteJournal(deps, repository, journal); } catch {
        if (kind === "result") mutationUncertain = true;
        else journal.transitions.pop();
        fail("remote_journal_append_failed");
      }
      try { await writeJournal(journalPath, journal); } catch { if (kind === "result") mutationUncertain = true; fail("deployment_journal_write_failed"); }
    };

    await transition("disabled_deploy", "intent", starting.id);
    await verifyCurrent(deps, starting.id);
    await verifyLeaseHead(deps, repository, journal);
    providerMutation = true;
    mutationUncertain = true;
    const disabledOutput = await wrangler(deps, ["deploy", ...deployVars(configured, false, commit),
      "--message", `Automated production release disabled gate at ${commit.slice(0, 7)}`], 600_000);
    mutationUncertain = false;
    const disabledId = deployedVersionFromOutput(disabledOutput);
    await verifyCurrent(deps, disabledId);
    const disabledRaw = await readVersion(deps, disabledId);
    verifyCandidateVersion(disabledRaw, disabledId, commit, false);
    verifyConfig(disabledRaw, configured);
    const disabledContainer = await readContainer(deps);
    if (disabledContainer.id !== startingContainer.id) fail("cloudflare_deployment_drift");
    await verifyDisabledRoutes(deps);
    await waitForInactive(deps, disabledContainer.id);
    journal.disabledVersion = disabledId;
    journal.disabledImage = disabledContainer.image;
    journal.disabledApplicationVersion = disabledContainer.version;
    journal.lastVerifiedState = "disabled";
    journal.checks.push("disabled_version", "disabled_routes", "container_inactive");
    await transition("disabled_deploy", "result", disabledId);

    await transition("enable_deploy", "intent", disabledId);
    await verifyCurrent(deps, disabledId);
    await verifyLeaseHead(deps, repository, journal);
    mutationUncertain = true;
    const enabledOutput = await wrangler(deps, ["deploy", ...deployVars(configured, true, commit), "--containers-rollout", "none", "--message",
      `Automated production release enabled at ${commit.slice(0, 7)}`], 180_000);
    mutationUncertain = false;
    const enabledId = deployedVersionFromOutput(enabledOutput);
    journal.enabledVersion = enabledId;
    await verifyCurrent(deps, enabledId);
    const enabledRaw = await readVersion(deps, enabledId);
    verifyCandidateVersion(enabledRaw, enabledId, commit, true);
    verifyConfig(enabledRaw, configured);
    const enabledContainer = await readContainer(deps);
    if (enabledContainer.id !== disabledContainer.id || enabledContainer.image !== disabledContainer.image || enabledContainer.version !== disabledContainer.version) {
      fail("container_image_changed_during_enable");
    }
    journal.enabledImage = enabledContainer.image;
    journal.enabledApplicationVersion = enabledContainer.version;
    journal.lastVerifiedState = "enabled";
    journal.checks.push("enabled_version", "image_reused");
    await transition("enable_deploy", "result", enabledId);
    await runAt(deps, deps.packageRoot, "pnpm", ["production:probe"], {
      timeoutMs: 120_000,
      env: { NEMLIG_EXPECTED_REVISION: commit },
    });
    await runAt(deps, deps.packageRoot, "pnpm", ["production:test:features", ...(service ? ["--", "--service"] : [])], {
      timeoutMs: 120_000,
      ...(service ? { env: { NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: commit } } : {}),
    });
    await waitForRunningInstance(deps, enabledContainer.id, enabledContainer.version);
    await verifyCurrent(deps, enabledId);
    const provenContainer = await readContainer(deps);
    if (provenContainer.id !== enabledContainer.id || provenContainer.image !== enabledContainer.image || provenContainer.version !== enabledContainer.version) {
      fail("cloudflare_deployment_drift");
    }
    journal.enabledVersion = enabledId;
    journal.checks.push("edge_acceptance", service ? "service_fixture_acceptance" : "authenticated_read_only_acceptance");
    if (inputDeps.acceptanceMode === "service-cutover") journal.checks.push("live_acceptance_pending");
    journal.outcome = "success";
  } catch (error) {
    console.error(error instanceof Error ? error.message : "unexpected deployment failure");
    journal.outcome = "failed";
    journal.failure = error instanceof DeployFailure && journalFailures.has(error.code) ? error.code : "unexpected_failure";
    if (mutationUncertain) {
      journal.lastVerifiedState = "unknown";
    } else if (providerMutation && starting) {
      try {
        const current = await readCurrent(deps);
        const state = parseVersionState(await readVersion(deps, current.version), current.version);
        const candidate = journal.enabledVersion ?? journal.disabledVersion;
        if (current.version !== candidate && current.version !== starting.id) {
          journal.failure = "cloudflare_deployment_drift";
          journal.lastVerifiedState = "unknown";
        } else if (!state.enabled && current.version === journal.disabledVersion
          && journal.checks.includes("disabled_routes") && journal.checks.includes("container_inactive")) {
          const expected = expectedRecovery({ ...journal, lastVerifiedState: "disabled" });
          if (!expected || !await verifyRecoveryTarget(deps, expected)) fail("cloudflare_deployment_drift");
          await verifyDisabledRoutes(deps);
          journal.lastVerifiedState = "disabled";
        } else if (current.version === starting.id) {
          if (!startingContainer || !journal.startingConfigDigest || !await verifyRecoveryTarget(deps, {
            version: starting.id, containerId: startingContainer.id, image: startingContainer.image,
            applicationVersion: startingContainer.version, configDigest: journal.startingConfigDigest, enabled: starting.enabled, state: "restored",
          })) fail("cloudflare_deployment_drift");
          journal.lastVerifiedState = starting.enabled ? "enabled" : "disabled";
        } else if (startingContainer && transition) {
          await transition("rollback", "intent", starting.id);
          await verifyCurrent(deps, current.version);
          await verifyLeaseHead(deps, repository, journal);
          await rollback(deps, journal, starting, startingContainer);
          await transition("rollback", "result", starting.id);
        }
      } catch {
        journal.rollback = journal.rollback === "attempted" ? "failed" : journal.rollback;
        journal.lastVerifiedState = "unknown";
      }
    }
  } finally {
    journal.completedAt = deps.now().toISOString();
    let remoteSaved = false;
    if (repository && journal.remoteCommit) {
      try {
        await appendRemoteJournal(deps, repository, journal);
        remoteSaved = true;
      } catch {
        journal.outcome = "failed";
        journal.failure = "remote_journal_append_failed";
        journal.lastVerifiedState = "unknown";
      }
    }
    let localSaved = false;
    if (journalPath) {
      try {
        await writeJournal(journalPath, journal);
        localSaved = true;
      } catch {
        journal.outcome = "failed";
        journal.failure = "deployment_journal_write_failed";
        if (providerMutation) journal.lastVerifiedState = "unknown";
      }
    }
    if (journal.outcome === "failed" && journal.lastVerifiedState === "unchanged"
      && !providerMutation && !mutationUncertain && remoteSaved && localSaved && repository && journal.remoteCommit && lockPath) {
      try { await releaseDeploymentLeases(deps, repository, journal.remoteCommit, journal.operationId, lockPath); }
      catch { /* retain either remaining lease for explicit recovery */ }
    }
    clearTimeout(operationDeadline);
    inheritedSignal?.removeEventListener("abort", abortOperation);
  }
  return journal;
}

async function main(): Promise<void> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(packageRoot, "../..");
  const input = parseProductionDeployCli(process.argv.slice(2));
  if (input.help) {
    console.log(`Usage: ${productionDeployUsage}`);
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const deps: DeployDependencies = {
    repoRoot, packageRoot, env: process.env, run: defaultRunner, fetcher: fetch, signal: controller.signal,
    sleep: async (milliseconds) => await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)), now: () => new Date(),
  };
  if (input.command === "inspect-recovery") {
    console.log(JSON.stringify(await inspectDeploymentRecovery(input.operation, deps, input.originalRunnerStopped)));
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    return;
  }
  if (input.command === "finalize") {
    const finalized = await finalizeDeploymentRecovery(input.operation, deps, input.evidenceSaved, input.originalRunnerStopped);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    if (!finalized) process.exitCode = 1;
    console.log(JSON.stringify({ finalized }));
    return;
  }
  if (input.command === "preflight") {
    console.log(JSON.stringify(await preflightProductionDeploy(input.commit, deps)));
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    return;
  }
  const report = await deployProduction(input.commit, { ...deps, ...(input.acceptanceMode ? { acceptanceMode: input.acceptanceMode } : {}) });
  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "success") process.exitCode = 1;
}

if (process.argv[1] && basename(process.argv[1]).replace(/\.ts$/u, ".js") === "production-deploy.js") {
  main().catch((error) => {
    console.error(error instanceof DeployFailure ? error.code : "production_deploy_failed");
    process.exitCode = 1;
  });
}
