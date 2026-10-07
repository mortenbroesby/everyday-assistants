import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deploymentFailureReasons } from "./production-failure-reasons.js";
import { issueServiceToken } from "./service-token.js";
import { parseRegistryCredentialOutput, readRegistryTagDigest, registryCredentialCommand, productionImageName } from "./container-image-retention.js";

const fullSha = /^[0-9a-f]{40}$/u;
const revisionSha = /^[0-9a-f]{7,40}$/u;
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const remoteLeaseRef = "refs/heads/codex-lock/nemlig-production";
const productionRepository = "mortenbroesby/everyday-assistants";
const ciWorkflowName = "CI";
const ciWorkflowPath = ".github/workflows/ci.yml";
const customMcp = new URL("https://nemlig-mcp.broesby.dk/mcp");
const workersMcp = new URL("https://nemlig-mcp-cloudflare-production.mortenbroesby.workers.dev/mcp");
const containerApplication = "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production";
export const productionDeployUsage = "pnpm --filter nemlig-assistant production:deploy -- preflight [--recovery] <40-character-main-commit> | [--service|--recovery] <40-character-main-commit> | reconcile-recovery <operation-id> --evidence-saved --original-runner-stopped [--authorize-one-container-restore] | finalize <operation-id> --evidence-saved --original-runner-stopped | inspect-recovery <operation-id> [--original-runner-stopped]";

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
  startingRevision?: string;
  disabledVersion?: string;
  enabledVersion?: string;
  startingApplicationVersion?: number;
  restoredApplicationVersion?: number;
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
  deliveryMode?: "routine" | "recovery";
  outcome: "running" | "success" | "failed";
  failure?: string;
  recoveryFailure?: string;
  acceptanceFailure?: AcceptanceFailureEvidence;
  remoteCommit?: string;
  transitions: JournalTransition[];
}

interface AcceptanceFailureEvidence {
  stage: "edge" | "read_only";
  profile: "edge" | "service" | "live-user";
  category: "input_invalid" | "deadline_exceeded" | "edge_failed" | "authentication_failed" | "transport_failed" | "feature_failed" | "mutation_failed" | "unknown_failure";
  lastCompletedBoundary: string;
  correlationIds: string[];
}

type JournalPhase = "disabled_deploy" | "enable_deploy" | "rollback" | "container_restore" | "worker_restore";
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
  captureFailureStdout?: (stdout: string) => AcceptanceFailureEvidence | undefined;
  signal?: AbortSignal;
}

export type CommandRunner = (command: string, args: readonly string[], options?: RunOptions) => Promise<string>;

export interface DeployDependencies {
  repoRoot: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  fetcher: typeof fetch;
  registryFetcher?: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
  operationId?: () => string;
  operationDeadlineMs?: number;
  stateRoot?: string;
  diagnostic?: (message: string) => void;
  acceptanceMode?: "owner" | "service" | "recovery";
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
  constructor(code: string, readonly status?: number, readonly acceptanceFailure?: AcceptanceFailureEvidence, readonly diagnostic?: string) {
    super(code);
  }
}

class AcceptanceFailure extends DeployFailure {
  constructor(code: string, readonly evidence?: AcceptanceFailureEvidence) {
    super(code);
  }
}

const fail = (code: string): never => { throw new DeployFailure(code); };

/** Emits only a provider HTTP status or documented numeric error code, never stderr text. */
export const commandFailureDiagnostic = (stderr: string): string | undefined => {
  const http = /\bHTTP\s+([45]\d\d)\b/iu.exec(stderr)?.[1];
  if (http) return `command_http_status=${http}`;
  const code = /\b(?:error\s+)?code\s*[:#]?\s*(\d{3,6})\b/iu.exec(stderr)?.[1];
  return code ? `command_provider_error_code=${code}` : undefined;
};

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
const journalPhases = new Set<JournalPhase>(["disabled_deploy", "enable_deploy", "rollback", "container_restore", "worker_restore"]);
const journalKinds = new Set<JournalKind>(["intent", "result"]);
const journalLimit = 8 * 1024;
const validReleaseRun = (value: number | "local") => value === "local" || (Number.isSafeInteger(value) && value >= 1);
const isoTime = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const imageDigest = /^sha256:[0-9a-f]{64}$/u;
const journalChecks = new Set(["source_and_auth_preflight", "recovery_source", "exclusive_lease", "starting_state_recorded", "disabled_version", "disabled_routes", "container_inactive", "enabled_version", "image_reused", "container_rollout", "edge_acceptance", "authenticated_read_only_acceptance", "service_fixture_acceptance", "starting_version_restored", "container_restore_reconciliation_attempted", "container_restore_explicit_authorized_retry"]);
const acceptanceFailureCategories = new Set(["input_invalid", "deadline_exceeded", "edge_failed", "authentication_failed", "transport_failed", "feature_failed", "mutation_failed", "unknown_failure"]);
const routineRecoveryEligibleFailures = new Set(["container_instance_timeout"]);

const validAcceptanceFailure = (value: unknown): value is AcceptanceFailureEvidence => {
  const evidence = object(value);
  return Boolean(evidence && Object.keys(evidence).every((key) => ["stage", "profile", "category", "lastCompletedBoundary", "correlationIds"].includes(key))
    && (evidence.stage === "edge" || evidence.stage === "read_only")
    && (evidence.profile === "edge" || evidence.profile === "service" || evidence.profile === "live-user")
    && ((evidence.stage === "edge") === (evidence.profile === "edge"))
    && typeof evidence.category === "string" && acceptanceFailureCategories.has(evidence.category)
    && typeof evidence.lastCompletedBoundary === "string" && /^[A-Za-z0-9_:-]{1,64}$/u.test(evidence.lastCompletedBoundary)
    && Array.isArray(evidence.correlationIds) && evidence.correlationIds.length <= 16
    && evidence.correlationIds.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id)));
};

const journalJson = (journal: DeploymentJournal): string => {
  if (!journal || typeof journal !== "object" || !Array.isArray(journal.checks) || !Array.isArray(journal.transitions)
    || !operationId.test(journal.operationId) || !fullSha.test(journal.commit) || !Number.isSafeInteger(journal.ciRunId) || journal.ciRunId < 1
    || !isoTime(journal.startedAt) || (journal.completedAt !== undefined && !isoTime(journal.completedAt))
    || (journal.deliveryMode !== undefined && !["routine", "recovery"].includes(journal.deliveryMode))
    || !validReleaseRun(journal.releaseRunId) || !validReleaseRun(journal.releaseRunAttempt)
    || ((journal.releaseRunId === "local") !== (journal.releaseRunAttempt === "local"))
    || journal.transitions.length > 32
    || (journal.remoteCommit !== undefined && (typeof journal.remoteCommit !== "string" || !fullSha.test(journal.remoteCommit)))
    || (journal.startingVersion !== undefined && (typeof journal.startingVersion !== "string" || !versionId.test(journal.startingVersion)))
    || (journal.startingRevision !== undefined && (typeof journal.startingRevision !== "string" || !revisionSha.test(journal.startingRevision)))
    || (journal.disabledVersion !== undefined && (typeof journal.disabledVersion !== "string" || !versionId.test(journal.disabledVersion)))
    || (journal.enabledVersion !== undefined && (typeof journal.enabledVersion !== "string" || !versionId.test(journal.enabledVersion)))
    || [journal.startingApplicationVersion, journal.restoredApplicationVersion, journal.disabledApplicationVersion, journal.enabledApplicationVersion].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 1))
    || (journal.startingConfigDigest !== undefined && (typeof journal.startingConfigDigest !== "string" || !/^[0-9a-f]{64}$/u.test(journal.startingConfigDigest)))
    || (journal.startingEnabled !== undefined && typeof journal.startingEnabled !== "boolean")
    || (journal.startingContainerId !== undefined && (typeof journal.startingContainerId !== "string" || !versionId.test(journal.startingContainerId)))
    || (journal.startingImage !== undefined && (typeof journal.startingImage !== "string" || !imageDigest.test(journal.startingImage)))
    || (journal.disabledImage !== undefined && (typeof journal.disabledImage !== "string" || !imageDigest.test(journal.disabledImage)))
    || (journal.enabledImage !== undefined && (typeof journal.enabledImage !== "string" || !imageDigest.test(journal.enabledImage)))
    || (journal.acceptanceFailure !== undefined && (!validAcceptanceFailure(journal.acceptanceFailure) || journal.outcome !== "failed"))) fail("deployment_journal_invalid");
  if (journal.checks.some((check) => !journalChecks.has(check))
    || (journal.failure !== undefined && !deploymentFailureReasons.has(journal.failure))
    || (journal.recoveryFailure !== undefined && !deploymentFailureReasons.has(journal.recoveryFailure))) fail("deployment_journal_invalid");
  const phaseOrder: JournalPhase[] = journal.transitions[0]?.phase === "enable_deploy"
    ? journal.transitions.some(({ phase }) => phase === "rollback")
      ? ["enable_deploy", "rollback", "container_restore", "worker_restore"]
      : ["enable_deploy", "container_restore", "worker_restore"]
    : ["disabled_deploy", "enable_deploy", "rollback"];
  let nextPhase = 0;
  let expecting: JournalKind = "intent";
  for (const transition of journal.transitions) {
    if (!transition || typeof transition !== "object" || !journalPhases.has(transition.phase) || !journalKinds.has(transition.kind)
      || !isoTime(transition.at) || (transition.version !== undefined && (typeof transition.version !== "string" || !versionId.test(transition.version)))
      || Object.keys(transition).some((key) => !["phase", "kind", "at", "version"].includes(key))
      || transition.phase !== phaseOrder[nextPhase]
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
  const allowed = new Set(["schema", "operationId", "commit", "ciRunId", "releaseRunId", "releaseRunAttempt", "startedAt", "completedAt", "startingVersion", "startingRevision", "disabledVersion", "enabledVersion", "startingApplicationVersion", "restoredApplicationVersion", "disabledApplicationVersion", "enabledApplicationVersion", "startingConfigDigest", "startingEnabled", "startingContainerId", "startingImage", "disabledImage", "enabledImage", "checks", "lastVerifiedState", "rollback", "deliveryMode", "outcome", "failure", "recoveryFailure", "acceptanceFailure", "remoteCommit", "transitions"]);
  if (!value || Object.keys(value).some((key) => !allowed.has(key)) || value.schema !== 2
    || typeof value.operationId !== "string" || typeof value.commit !== "string" || typeof value.ciRunId !== "number" || typeof value.startedAt !== "string"
    || (value.releaseRunId !== "local" && typeof value.releaseRunId !== "number") || (value.releaseRunAttempt !== "local" && typeof value.releaseRunAttempt !== "number")
    || !Array.isArray(value.checks) || !Array.isArray(value.transitions)
    || !["unchanged", "disabled", "enabled", "restored", "unknown"].includes(value.lastVerifiedState as string)
    || !["not_needed", "attempted", "restored", "failed"].includes(value.rollback as string)
    || !["running", "success", "failed"].includes(value.outcome as string)) fail("deployment_journal_invalid");
  const normalized = { ...value };
  for (const field of ["disabledVersion", "disabledApplicationVersion", "disabledImage"] as const) {
    if (normalized[field] === null) delete normalized[field];
  }
  const journal = normalized as unknown as DeploymentJournal;
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
  | { help: false; command: "preflight"; commit: string; recovery: boolean }
  | { help: false; command: "deploy"; commit: string; acceptanceMode?: "service" | "recovery" }
  | { help: false; command: "reconcile-recovery"; operation: string; evidenceSaved: true; originalRunnerStopped: true; authorizeOneContainerRestore: boolean }
  | { help: false; command: "finalize"; operation: string; evidenceSaved: true; originalRunnerStopped: true }
  | { help: false; command: "inspect-recovery"; operation: string; originalRunnerStopped: boolean };

/** Parses all recovery commands before any repository or provider access. */
export function parseProductionDeployCli(argv: readonly string[]): RecoveryCli {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  if (values.length === 1 && (values[0] === "--help" || values[0] === "-h")) return { help: true };
  if (values[0] === "finalize" && values.length === 4 && operationId.test(values[1] ?? "") && values[2] === "--evidence-saved" && values[3] === "--original-runner-stopped") {
    return { help: false, command: "finalize", operation: values[1]!, evidenceSaved: true, originalRunnerStopped: true };
  }
  if (values[0] === "reconcile-recovery" && operationId.test(values[1] ?? "") && values[2] === "--evidence-saved" && values[3] === "--original-runner-stopped"
    && (values.length === 4 || (values.length === 5 && values[4] === "--authorize-one-container-restore"))) {
    return { help: false, command: "reconcile-recovery", operation: values[1]!, evidenceSaved: true, originalRunnerStopped: true, authorizeOneContainerRestore: values.length === 5 };
  }
  if (values[0] === "inspect-recovery" && operationId.test(values[1] ?? "")
    && (values.length === 2 || (values.length === 3 && values[2] === "--original-runner-stopped"))) {
    return { help: false, command: "inspect-recovery", operation: values[1]!, originalRunnerStopped: values[2] === "--original-runner-stopped" };
  }
  if (values[0] === "preflight") {
    const recovery = values[1] === "--recovery";
    return { help: false, command: "preflight", commit: parseDeployArgs(values.slice(recovery ? 2 : 1)), recovery };
  }
  if (values[0] === "--service") return { help: false, command: "deploy", commit: parseDeployArgs(values.slice(1)), acceptanceMode: "service" };
  if (values[0] === "--recovery") return { help: false, command: "deploy", commit: parseDeployArgs(values.slice(1)), acceptanceMode: "recovery" };
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

const configPlainNames = ["MCP_AUTH_TIMEOUT_MS", "MCP_CONTROL_TIMEOUT_MS", "MCP_TOTAL_TIMEOUT_MS", "MCP_BACKEND_TIMEOUT_MS", "MCP_CREDENTIAL_ONBOARDING_ENABLED", "NEMLIG_MCP_ONBOARDING_CLIENT_ID", "NEMLIG_MCP_CREDENTIAL_KEY_VERSION", "NEMLIG_MCP_HTTP_HOST", "NEMLIG_MCP_HTTP_PORT", "NEMLIG_MCP_AUTH0_ISSUER", "NEMLIG_MCP_AUTH0_AUDIENCE", "NEMLIG_MCP_PUBLIC_URL", "NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "NEMLIG_MCP_SERVICE_CLIENT_ID"] as const;
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
      || (value.script_name !== undefined && value.script_name !== null && value.script_name !== productionWorker)
      || (value.environment !== undefined && value.environment !== null && value.environment !== "production")
      || (value.environment !== undefined && value.environment !== null && value.script_name == null)) fail("cloudflare_runtime_safety_mismatch");
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
  if (configPlainNames.filter((name) => name !== "NEMLIG_MCP_SERVICE_CLIENT_ID" && name !== "NEMLIG_MCP_ONBOARDING_CLIENT_ID").some((name) => {
    const value = normalized.get(name);
    return typeof value !== "string" || value.length === 0 || value.length > 2048;
  }) || serviceClientId.length > 2048) fail("cloudflare_runtime_safety_mismatch");
  if (!["true", "false"].includes(normalized.get("MCP_CREDENTIAL_ONBOARDING_ENABLED") ?? "")) fail("cloudflare_runtime_safety_mismatch");
  const browserClientId = normalized.get("NEMLIG_MCP_ONBOARDING_CLIENT_ID") ?? "";
  const onboardingEnabled = normalized.get("MCP_CREDENTIAL_ONBOARDING_ENABLED") === "true";
  if ((browserClientId !== "" || onboardingEnabled) && !/^[A-Za-z0-9_-]{8,128}$/u.test(browserClientId)) fail("cloudflare_runtime_safety_mismatch");
  if (!["true", "false"].includes(serviceEnabled ?? "")
    || (serviceEnabled === "true" && !/^[A-Za-z0-9_-]{1,128}$/u.test(serviceClientId))) fail("cloudflare_runtime_safety_mismatch");
  if (!/^[A-Za-z0-9._-]{1,32}$/u.test(normalized.get("NEMLIG_MCP_CREDENTIAL_KEY_VERSION") ?? "")) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  for (const name of ["MCP_AUTH_TIMEOUT_MS", "MCP_CONTROL_TIMEOUT_MS", "MCP_TOTAL_TIMEOUT_MS", "MCP_BACKEND_TIMEOUT_MS"]) {
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
    || (requireSecrets && ([...requiredSecrets].some((name) => !secretNames.includes(name))
      || (onboardingEnabled && ["NEMLIG_MCP_ONBOARDING_SESSION_KEY", "NEMLIG_MCP_CREDENTIAL_KEY"].some((name) => !secretNames.includes(name)))))) fail("cloudflare_runtime_safety_mismatch");
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
    } else if (value.type !== "durable_object_namespace") fail("cloudflare_runtime_unexpected_binding");
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
  if ((enabled !== "true" && enabled !== "false") || typeof revision !== "string" || !revisionSha.test(revision)) {
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
  const digest = typeof image === "string" ? image.match(/(?:^|@)(sha256:[0-9a-f]{64})$/u)?.[1] : undefined;
  const version = value.version;
  if (typeof id !== "string" || !versionId.test(id) || !digest
    || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1
    || value.name !== containerApplication
    || value.instances !== 1) throw new DeployFailure("cloudflare_container_ambiguous");
  return { id, image: digest, version };
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

const manifestDigest = (raw: string): string => {
  const descriptor = object(object(json(raw, "cloudflare_registry_manifest_invalid"))?.Descriptor);
  const digest = descriptor?.digest;
  return typeof digest === "string" && imageDigest.test(digest) ? digest : fail("cloudflare_registry_manifest_invalid");
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
    else done(new CommandFailure("command_failed", /HTTP 404\b/u.test(stderr) ? 404 : undefined,
      options.captureFailureStdout?.(output.slice(-16 * 1024).trim()), commandFailureDiagnostic(stderr)));
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

const readContainer = async (deps: DeployDependencies, applicationId?: string): Promise<ContainerState> => {
  const id = applicationId ?? parseContainer(await wrangler(deps, ["containers", "list", "--json"])).id;
  const info = object(json(await wrangler(deps, ["containers", "info", id, "--json"]), "cloudflare_containers_invalid"));
  const configuration = object(info?.configuration);
  return parseContainer(JSON.stringify([{ id: info?.id, name: info?.name, instances: info?.instances, image: configuration?.image, version: info?.version }]));
};

interface ContainerApplicationReadback { image: string; version: number; schedulingPolicy: string; activeRolloutId?: string }

interface ContainerVersionConfiguration { image: string; logsEnabled: boolean }

const readContainerApplication = async (deps: DeployDependencies, applicationId: string): Promise<ContainerApplicationReadback> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  const token = deps.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token) fail("cloudflare_container_restore_unavailable");
  let response: Response;
  try {
    response = await deps.fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/containers/applications/${applicationId}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: deps.signal,
    });
  } catch { return fail("cloudflare_container_restore_read_failed"); }
  let envelope: unknown;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) return fail("cloudflare_container_restore_read_failed");
    envelope = JSON.parse(raw) as unknown;
  } catch { return fail("cloudflare_container_restore_read_failed"); }
  const result = object(object(envelope)?.result);
  const configuration = object(result?.configuration);
  const image = configuration?.image;
  const version = result?.version;
  const schedulingPolicy = result?.scheduling_policy;
  const activeRolloutId = result?.active_rollout_id;
  if (!response.ok || object(envelope)?.success !== true || result?.id !== applicationId
    || typeof image !== "string" || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1
    || (activeRolloutId !== undefined && activeRolloutId !== null && typeof activeRolloutId !== "string")) {
    return fail("cloudflare_container_restore_read_failed");
  }
  if (schedulingPolicy !== "default") return fail("cloudflare_container_restore_unavailable");
  return {
    image, version, schedulingPolicy,
    ...(typeof activeRolloutId === "string" ? { activeRolloutId } : {}),
  };
};

/** Read the immutable configuration of the exact application version being restored. */
const readContainerVersionConfiguration = async (
  deps: DeployDependencies, applicationId: string, version: number,
): Promise<ContainerVersionConfiguration> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  const token = deps.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token) fail("cloudflare_container_restore_unavailable");
  let response: Response;
  try {
    response = await deps.fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/containers/applications/${applicationId}/versions`, {
      headers: { Authorization: `Bearer ${token}` }, signal: deps.signal,
    });
  } catch { return fail("cloudflare_container_restore_read_failed"); }
  let envelope: unknown;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) return fail("cloudflare_container_restore_read_failed");
    envelope = JSON.parse(raw) as unknown;
  } catch { return fail("cloudflare_container_restore_read_failed"); }
  const result = object(envelope)?.result;
  if (!response.ok || object(envelope)?.success !== true || !Array.isArray(result)) return fail("cloudflare_container_restore_read_failed");
  const match = result.map(object).find((entry) => entry?.version === version);
  const configuration = object(match?.configuration);
  const image = configuration?.image;
  const logsEnabled = object(object(configuration?.observability)?.logs)?.enabled;
  if (typeof image !== "string" || typeof logsEnabled !== "boolean") return fail("cloudflare_container_restore_read_failed");
  return { image, logsEnabled };
};

const restoreStartingContainerImage = async (
  deps: DeployDependencies, journal: DeploymentJournal, expectedCurrent: ContainerState,
): Promise<number> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  const token = deps.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token || !journal.startingImage || !journal.enabledImage
    || !journal.enabledApplicationVersion || !journal.startingContainerId) fail("cloudflare_container_restore_unavailable");
  const applicationId = journal.startingContainerId as string;
  const before = await readContainerApplication(deps, applicationId);
  const candidateImage = `registry.cloudflare.com/${account}/${containerApplication}@${journal.enabledImage}`;
  if (before.image !== candidateImage || before.version !== expectedCurrent.version || before.activeRolloutId) fail("cloudflare_deployment_drift");
  const targetImage = `registry.cloudflare.com/${account}/${containerApplication}@${journal.startingImage}`;
  const startingApplicationVersion: number = journal.startingApplicationVersion ?? fail("cloudflare_container_restore_unavailable");
  const prior = await readContainerVersionConfiguration(deps, applicationId, startingApplicationVersion);
  if (prior.image !== targetImage) fail("cloudflare_deployment_drift");
  let response: Response;
  try {
    response = await deps.fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/containers/applications/${applicationId}/rollouts`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `Restore known accepted release after ${journal.commit.slice(0, 7)} acceptance failure`,
        kind: "full_auto",
        step_percentage: 100,
        strategy: "rolling",
        target_configuration: {
          image: targetImage,
          instance_type: "lite",
          observability: { logs: { enabled: prior.logsEnabled } },
        },
      }),
      signal: deps.signal,
    });
  } catch { return fail("cloudflare_container_restore_uncertain"); }
  let envelope: unknown;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) return fail("cloudflare_container_restore_uncertain");
    envelope = JSON.parse(raw) as unknown;
  } catch { return fail("cloudflare_container_restore_uncertain"); }
  const result = object(object(envelope)?.result);
  if (!response.ok || object(envelope)?.success !== true || typeof result?.id !== "string" || result.id.length === 0) {
    return fail("cloudflare_container_restore_uncertain");
  }
  const rolloutId = result.id;
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    const current = await readContainerApplication(deps, applicationId);
    if (current.activeRolloutId && current.activeRolloutId !== rolloutId) fail("cloudflare_deployment_drift");
    if (current.image === targetImage && !current.activeRolloutId && current.version > expectedCurrent.version) return current.version;
    if (!current.activeRolloutId && current.image !== candidateImage && current.image !== targetImage) fail("cloudflare_deployment_drift");
    if (attempt < 35) await sleepAbortably(deps, 5_000);
  }
  return fail("cloudflare_container_restore_timeout");
};

const resolveCandidateImage = async (deps: DeployDependencies, workerVersion: string): Promise<string> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account || !/^[0-9a-f]{32}$/u.test(account)) fail("cloudflare_registry_manifest_invalid");
  const ref = `registry.cloudflare.com/${account}/${containerApplication}:${workerVersion.split("-")[0]}`;
  return manifestDigest(await runAt(deps, deps.packageRoot, "docker", ["manifest", "inspect", "-v", ref], { timeoutMs: 120_000 }));
};

const resolveCandidateImageFromRegistry = async (deps: DeployDependencies, workerVersion: string): Promise<string> => {
  const accountId = deps.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId || !/^[0-9a-f]{32}$/u.test(accountId)) throw new DeployFailure("cloudflare_registry_manifest_invalid");
  const output = await runAt(deps, deps.packageRoot, "pnpm", registryCredentialCommand("pull"), { timeoutMs: 30_000 });
  const { authorization } = parseRegistryCredentialOutput(output, "cloudflare_registry");
  return await readRegistryTagDigest({
    accountId,
    repository: `${accountId}/${productionImageName}`,
    tag: workerVersion.split("-")[0]!,
    authorization,
    fetcher: deps.registryFetcher ?? fetch,
    signal: deps.signal,
  });
};

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
    || value.name !== productionWorker || value.keep_vars !== false) fail("cloudflare_config_invalid");
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
  for (const name of ["NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "NEMLIG_MCP_SERVICE_CLIENT_ID", "NEMLIG_MCP_ONBOARDING_CLIENT_ID"]) {
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
  } catch {
    fail("remote_journal_append_failed");
  }
  journal.remoteCommit = child;
};

const readRemoteJournal = async (deps: DeployDependencies, repository: string): Promise<{ head: string; parent?: string; journal: DeploymentJournal }> => {
  const head = await readRemoteHead(deps, repository);
  if (!head) fail("remote_journal_missing");
  const commit = await ghJson(deps, repository, "GET", `git/commits/${head}`);
  const tree = object(commit.tree);
  if (typeof tree?.sha !== "string" || !fullSha.test(tree.sha)) fail("remote_journal_invalid");
  if (!Array.isArray(commit.parents)) fail("remote_journal_invalid");
  const parents = (commit.parents as unknown[]).map(object);
  if (parents.length > 1 || parents.some((parent) => typeof parent?.sha !== "string" || !fullSha.test(parent.sha))) fail("remote_journal_invalid");
  const parent = parents[0]?.sha as string | undefined;
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
  return { head: head as string, parent, journal: parseDeploymentJournal(decoded.toString("utf8")) };
};

type RecoveryReason = "eligible" | "operation_mismatch" | "runner_not_stopped" | "pending_or_unknown" | "provider_outcome_unknown" | "provider_drift" | "journal_head_changed" | "journal_missing" | "journal_invalid";
export interface RecoveryInspection {
  operation: string;
  originalRunnerStopped: boolean;
  cleanupEligible: boolean;
  reason: RecoveryReason;
  state: "enabled" | "disabled" | "restored" | "unknown";
}

export interface RecoveryReconciliation {
  operation: string;
  originalRunnerStopped: boolean;
  reconciled: boolean;
  reason: RecoveryReason;
  state: "disabled" | "restored" | "unknown";
}

interface RecoveryTarget {
  version?: string;
  containerId: string;
  image: string;
  applicationVersion: number;
  configDigest?: string;
  sourceRevision?: string;
  enabled?: boolean;
  requireInactive?: boolean;
  state: "enabled" | "disabled" | "restored";
}

const expectedRecovery = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  if (!journal.startingConfigDigest || !journal.startingContainerId || typeof journal.startingEnabled !== "boolean") return undefined;
  const common = { containerId: journal.startingContainerId, configDigest: journal.startingConfigDigest };
  if (journal.outcome === "success" && journal.enabledVersion && journal.enabledImage && journal.enabledApplicationVersion) {
    return { ...common, version: journal.enabledVersion, image: journal.enabledImage, applicationVersion: journal.enabledApplicationVersion, enabled: true, sourceRevision: journal.commit, state: "enabled" };
  }
  if (journal.lastVerifiedState === "restored" && journal.startingVersion && journal.startingImage
    && (journal.startingApplicationVersion || journal.restoredApplicationVersion)
    && (!journal.restoredApplicationVersion || journal.checks.includes("starting_version_restored"))) {
    return { ...common, version: journal.startingVersion, image: journal.startingImage,
      applicationVersion: journal.restoredApplicationVersion ?? journal.startingApplicationVersion!, enabled: journal.startingEnabled, state: "restored" };
  }
  if (journal.outcome === "failed" && journal.lastVerifiedState === "disabled" && journal.disabledVersion && journal.disabledImage && journal.disabledApplicationVersion) {
    return { ...common, version: journal.disabledVersion, image: journal.disabledImage, applicationVersion: journal.disabledApplicationVersion, enabled: false, sourceRevision: journal.commit, state: "disabled" };
  }
  return undefined;
};

const packageVersionAtRevision = async (deps: DeployDependencies, revision: string): Promise<string> => {
  let exactRevision = revision;
  if (!fullSha.test(exactRevision)) {
    try { exactRevision = (await runAt(deps, deps.repoRoot, "git", ["rev-parse", "--verify", `${revision}^{commit}`])).trim(); }
    catch { return fail("recovery_source_invalid"); }
  }
  if (!fullSha.test(exactRevision)) return fail("recovery_source_invalid");
  let manifest: Record<string, unknown> | undefined;
  try {
    manifest = object(json(await runAt(deps, deps.repoRoot, "git", ["show", `${exactRevision}:apps/nemlig-assistant/package.json`]), "recovery_source_invalid"));
  } catch { return fail("recovery_source_invalid"); }
  const version = manifest?.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) return fail("recovery_source_invalid");
  return version;
};

/** Exact Worker and Container readback; terminal acceptance can make lifecycle rereads redundant. */
const verifyRecoveryTarget = async (
  deps: DeployDependencies,
  expected: RecoveryTarget,
  requireInstanceRead = true,
): Promise<string | undefined> => {
  const current = await readCurrent(deps);
  const raw = await readVersion(deps, current.version);
  const state = parseVersionState(raw, current.version);
  verifyCandidateVersion(raw, current.version, expected.sourceRevision ?? state.revision, expected.enabled ?? state.enabled);
  const container = await readContainer(deps, expected.containerId);
  let lifecycleMatches = true;
  if (requireInstanceRead) {
    // This is deliberately evaluated only for a pre-acceptance recovery proof.
    // A successful authenticated service check may wake a Container after it has
    // established the exact revision, image and application version.
    const instances = await wrangler(deps, ["containers", "instances", container.id, "--json"]);
    lifecycleMatches = expected.requireInactive
      ? instancesInactive(instances)
      : instancesInactive(instances) || (state.enabled && runningInstanceMatches(instances, expected.applicationVersion));
  }
  const exactMetadata = (expected.version === undefined || current.version === expected.version) && (expected.enabled === undefined || state.enabled === expected.enabled)
    && container.id === expected.containerId && container.image === expected.image && container.version === expected.applicationVersion
    && (expected.configDigest === undefined || versionConfig(raw).digest === expected.configDigest)
    && lifecycleMatches;
  if (!exactMetadata) return undefined;
  if (expected.enabled === false) {
    try { await verifyDisabledRoutes(deps); } catch { return undefined; }
  }
  return current.version;
};

const pendingRollbackTarget = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  const intent = journal.transitions.at(-1);
  if (journal.outcome !== "failed" || journal.lastVerifiedState !== "unknown"
    || !["attempted", "failed"].includes(journal.rollback)
    || intent?.phase !== "rollback" || intent.kind !== "intent"
    || !journal.enabledVersion || intent.version !== journal.enabledVersion
    || !journal.enabledImage || !journal.enabledApplicationVersion
    || !journal.startingContainerId || !journal.startingConfigDigest) return undefined;
  return {
    image: journal.enabledImage,
    applicationVersion: journal.enabledApplicationVersion,
    containerId: journal.startingContainerId,
    configDigest: journal.startingConfigDigest,
    sourceRevision: journal.commit,
    enabled: false,
    state: "disabled",
  };
};

/** A failed enable command may leave the already-disabled starting state intact. */
const pendingNoopEnableTarget = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  const intent = journal.transitions.at(-1);
  if (journal.outcome !== "failed" || journal.lastVerifiedState !== "unknown" || journal.rollback !== "not_needed"
    || journal.transitions.length !== 1 || intent?.phase !== "enable_deploy" || intent.kind !== "intent"
    || !journal.startingVersion || intent.version !== journal.startingVersion || journal.startingEnabled !== false
    || !journal.startingContainerId || !journal.startingImage || !journal.startingApplicationVersion || !journal.startingConfigDigest) return undefined;
  return {
    version: journal.startingVersion,
    image: journal.startingImage,
    applicationVersion: journal.startingApplicationVersion,
    containerId: journal.startingContainerId,
    configDigest: journal.startingConfigDigest,
    enabled: false,
    state: "restored",
  };
};

const pendingInterruptedEnableTarget = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  const intent = journal.transitions.at(-1);
  if (journal.outcome !== "failed" || journal.lastVerifiedState !== "unknown" || journal.rollback !== "not_needed"
    || journal.transitions.length !== 1 || intent?.phase !== "enable_deploy" || intent.kind !== "intent"
    || !journal.startingVersion || intent.version !== journal.startingVersion || journal.startingEnabled !== false
    || !journal.startingContainerId || !journal.startingImage || !journal.startingApplicationVersion || !journal.startingConfigDigest) return undefined;
  return {
    containerId: journal.startingContainerId,
    image: journal.startingImage,
    applicationVersion: journal.startingApplicationVersion,
    configDigest: journal.startingConfigDigest,
    sourceRevision: journal.commit,
    enabled: true,
    requireInactive: true,
    state: "enabled",
  };
};

const pendingInterruptedEnableRollbackTarget = (journal: DeploymentJournal): RecoveryTarget | undefined => {
  const [enableIntent, enableResult, rollbackIntent] = journal.transitions;
  if (journal.outcome !== "failed" || journal.lastVerifiedState !== "unknown" || journal.rollback !== "attempted"
    || journal.transitions.length !== 3 || enableIntent?.phase !== "enable_deploy" || enableIntent.kind !== "intent"
    || enableIntent.version !== journal.startingVersion || enableResult?.phase !== "enable_deploy" || enableResult.kind !== "result"
    || enableResult.version !== journal.enabledVersion || rollbackIntent?.phase !== "rollback" || rollbackIntent.kind !== "intent"
    || rollbackIntent.version !== journal.startingVersion || journal.startingEnabled !== false
    || !journal.startingVersion || !journal.startingContainerId || !journal.startingImage
    || !journal.startingApplicationVersion || !journal.startingConfigDigest) return undefined;
  return {
    version: journal.startingVersion,
    containerId: journal.startingContainerId,
    image: journal.startingImage,
    applicationVersion: journal.startingApplicationVersion,
    configDigest: journal.startingConfigDigest,
    enabled: false,
    state: "restored",
  };
};

type InterruptedContainerRestoreMode = "disabled" | "enabled";

const interruptedContainerRestoreMode = (journal: DeploymentJournal): InterruptedContainerRestoreMode | undefined => {
  const [enableIntent, enableResult, rollbackIntent, rollbackResult, containerIntent, containerResult, workerIntent, workerResult] = journal.transitions;
  // Older direct routine restores recorded the Worker and immutable Container
  // image as restored before their final authenticated service proof ran. They
  // are not terminal until that proof is appended, but the exact completed
  // transcript is safe to resume without issuing another provider mutation.
  const unacceptedRestoredDirectRoutine = journal.lastVerifiedState === "restored" && journal.rollback === "restored"
    && !journal.checks.includes("starting_version_restored");
  const common = journal.outcome === "failed"
    && ((journal.lastVerifiedState === "unknown" && journal.rollback === "failed") || unacceptedRestoredDirectRoutine)
    && journal.startingEnabled === true && Boolean(journal.startingVersion && journal.startingRevision && journal.startingImage
      && journal.startingApplicationVersion && journal.startingContainerId && journal.startingConfigDigest
      && journal.enabledVersion && journal.enabledImage && journal.enabledApplicationVersion)
    && enableIntent?.phase === "enable_deploy" && enableIntent.kind === "intent" && enableIntent.version === journal.startingVersion
    && enableResult?.phase === "enable_deploy" && enableResult.kind === "result" && enableResult.version === journal.enabledVersion;
  if (!common) return undefined;
  const directContainerIntent = rollbackIntent?.phase === "container_restore" && rollbackIntent.kind === "intent"
    && rollbackIntent.version === journal.enabledVersion;
  const directRestoreTransitionsComplete = directContainerIntent && (journal.transitions.length === 3
    || (journal.transitions.length === 4 && rollbackResult?.phase === "container_restore"
      && rollbackResult.kind === "result" && rollbackResult.version === journal.enabledVersion)
    || (journal.transitions.length === 5 && rollbackResult?.phase === "container_restore"
      && rollbackResult.kind === "result" && rollbackResult.version === journal.enabledVersion
      && containerIntent?.phase === "worker_restore" && containerIntent.kind === "intent" && containerIntent.version === journal.startingVersion)
    || (journal.transitions.length === 6 && rollbackResult?.phase === "container_restore"
      && rollbackResult.kind === "result" && rollbackResult.version === journal.enabledVersion
      && containerIntent?.phase === "worker_restore" && containerIntent.kind === "intent" && containerIntent.version === journal.startingVersion
      && containerResult?.phase === "worker_restore" && containerResult.kind === "result" && containerResult.version === journal.startingVersion));
  // Before sleeping Containers were accepted after a successful MCP exchange,
  // the same direct restore path could be recorded as a liveness timeout. The
  // transcript—not that obsolete failure label—establishes its safe shape.
  const directRoutineRestore = ["service_fixture_acceptance_failed", "container_instance_timeout", "edge_acceptance_failed"].includes(journal.failure ?? "")
    && directRestoreTransitionsComplete;
  if (directRoutineRestore) return "enabled";
  const disabledRestore = journal.failure === "container_instance_timeout"
    && Boolean(journal.disabledVersion && journal.disabledImage && journal.disabledApplicationVersion)
    && rollbackIntent?.phase === "rollback" && rollbackIntent.kind === "intent" && rollbackIntent.version === journal.enabledVersion
    && rollbackResult?.phase === "rollback" && rollbackResult.kind === "result" && rollbackResult.version === journal.disabledVersion
    && containerIntent?.phase === "container_restore" && containerIntent.kind === "intent" && containerIntent.version === journal.disabledVersion
    && (journal.transitions.length === 5 || (journal.transitions.length === 6 && containerResult?.phase === "container_restore"
      && containerResult.kind === "result" && containerResult.version === journal.enabledVersion)
      || (journal.transitions.length === 7 && containerResult?.phase === "container_restore"
        && containerResult.kind === "result" && containerResult.version === journal.enabledVersion
        && workerIntent?.phase === "worker_restore" && workerIntent.kind === "intent" && workerIntent.version === journal.startingVersion)
      || (journal.transitions.length === 8 && containerResult?.phase === "container_restore"
        && containerResult.kind === "result" && containerResult.version === journal.enabledVersion
        && workerIntent?.phase === "worker_restore" && workerIntent.kind === "intent" && workerIntent.version === journal.startingVersion
        && workerResult?.phase === "worker_restore" && workerResult.kind === "result" && workerResult.version === journal.startingVersion));
  return disabledRestore ? "disabled" : undefined;
};

const pendingInterruptedContainerRestore = (journal: DeploymentJournal): boolean => interruptedContainerRestoreMode(journal) !== undefined;

const pendingInterruptedDisabledDeploy = (journal: DeploymentJournal): boolean => {
  const [intent] = journal.transitions;
  return journal.outcome === "failed" && journal.lastVerifiedState === "unknown" && journal.rollback === "not_needed"
    && ["disabled_route_unavailable", "disabled_route_mismatch"].includes(journal.failure ?? "")
    && journal.transitions.length === 1 && intent?.phase === "disabled_deploy" && intent.kind === "intent"
    && Boolean(journal.startingVersion && intent.version === journal.startingVersion && journal.startingContainerId
      && journal.startingImage && journal.startingApplicationVersion && journal.startingConfigDigest)
    && typeof journal.startingEnabled === "boolean";
};

const verifyInterruptedDisabledDeploy = async (journal: DeploymentJournal, deps: DeployDependencies): Promise<RecoveryTarget | undefined> => {
  try {
    const current = await readCurrent(deps);
    if (current.version === journal.startingVersion) return undefined;
    const raw = await readVersion(deps, current.version);
    verifyCandidateVersion(raw, current.version, journal.commit, false);
    const container = await readContainer(deps, journal.startingContainerId);
    if ((container.image === journal.startingImage) !== (container.version === journal.startingApplicationVersion)) return undefined;
    const target: RecoveryTarget = {
      version: current.version,
      containerId: journal.startingContainerId!,
      image: await resolveCandidateImageFromRegistry(deps, current.version),
      applicationVersion: container.version,
      configDigest: journal.startingConfigDigest!,
      sourceRevision: journal.commit,
      enabled: false,
      state: "disabled",
    };
    if (container.image !== target.image || !await verifyRecoveryTarget(deps, target)) return undefined;
    return target;
  } catch { return undefined; }
};

/** Reconciles stopped failed operations from exact provider readback; any rollback is journaled and narrowly bound. */
export async function reconcilePendingRollback(
  operation: string,
  deps: DeployDependencies,
  evidenceSaved: boolean,
  originalRunnerStopped: boolean,
  authorizeOneContainerRestore = false,
): Promise<RecoveryReconciliation> {
  const denied = (reason: RecoveryReason): RecoveryReconciliation => ({
    operation, originalRunnerStopped, reconciled: false, reason, state: "unknown",
  });
  if (!operationId.test(operation) || !evidenceSaved) return denied("operation_mismatch");
  if (!originalRunnerStopped) return denied("runner_not_stopped");
  try {
    const repo = await repoIdentity(deps);
    const remote = await readRemoteJournal(deps, repo.nameWithOwner);
    const journal = remote.journal;
    if (journal.operationId !== operation) return denied("operation_mismatch");
    // Each remote snapshot stores its parent before the new ref is advanced.
    // Verify that exact relationship, then advance the in-memory parent to the
    // current head before appending the reconciled result.
    if (!journal.remoteCommit || journal.remoteCommit !== remote.parent) return denied("journal_head_changed");
    const rollbackTarget = pendingRollbackTarget(journal);
    const noopEnableTarget = pendingNoopEnableTarget(journal);
    const interruptedRollbackTarget = pendingInterruptedEnableRollbackTarget(journal);
    const interruptedEnableTarget = pendingInterruptedEnableTarget(journal);
    if (pendingInterruptedDisabledDeploy(journal)) {
      const target = await verifyInterruptedDisabledDeploy(journal, deps);
      if (!target) return denied("provider_drift");
      if (await readRemoteHead(deps, repo.nameWithOwner) !== remote.head) return denied("journal_head_changed");
      const reconciled: DeploymentJournal = {
        ...journal,
        remoteCommit: remote.head,
        disabledVersion: target.version,
        disabledImage: target.image,
        disabledApplicationVersion: target.applicationVersion,
        checks: [...new Set([...journal.checks, "disabled_version", "disabled_routes", "container_inactive"])],
        lastVerifiedState: "disabled",
        transitions: [...journal.transitions, {
          phase: "disabled_deploy", kind: "result", at: deps.now().toISOString(), version: target.version,
        }],
      };
      journalJson(reconciled);
      try { await appendRemoteJournal(deps, repo.nameWithOwner, reconciled); }
      catch (error) {
        if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
        return denied("journal_invalid");
      }
      return { operation, originalRunnerStopped, reconciled: true, reason: "eligible", state: "disabled" };
    }
    const startingTarget: RecoveryTarget | undefined = journal.startingVersion && journal.startingContainerId
      && journal.startingImage && journal.startingApplicationVersion && journal.startingConfigDigest
      ? { version: journal.startingVersion, containerId: journal.startingContainerId, image: journal.startingImage,
        applicationVersion: journal.startingApplicationVersion, configDigest: journal.startingConfigDigest,
        enabled: journal.startingEnabled, state: "restored" }
      : undefined;

    const interruptedRestoreMode = interruptedContainerRestoreMode(journal);
    if (interruptedRestoreMode) {
      journal.remoteCommit = remote.head;
      const applicationId = journal.startingContainerId!;
      const targetImage = `registry.cloudflare.com/${deps.env.CLOUDFLARE_ACCOUNT_ID}/${containerApplication}@${journal.startingImage}`;
      const candidateImage = `registry.cloudflare.com/${deps.env.CLOUDFLARE_ACCOUNT_ID}/${containerApplication}@${journal.enabledImage}`;
      const retainFailure = async (error: unknown): Promise<RecoveryReconciliation> => {
        journal.recoveryFailure = error instanceof DeployFailure && deploymentFailureReasons.has(error.code) ? error.code : "unexpected_failure";
        if (error instanceof AcceptanceFailure && error.evidence) journal.acceptanceFailure = error.evidence;
        try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); } catch { /* retain the lease even when the diagnostic append is uncertain */ }
        return denied(error instanceof DeployFailure && error.code === "cloudflare_container_restore_uncertain" ? "provider_outcome_unknown" : "provider_drift");
      };
      let current: CurrentDeployment;
      let application: ContainerApplicationReadback;
      try {
        current = await readCurrent(deps);
        application = await readContainerApplication(deps, applicationId);
      } catch { return denied("provider_drift"); }
      const candidateVersion = interruptedRestoreMode === "enabled" ? journal.enabledVersion : journal.disabledVersion;
      const candidateEnabled = interruptedRestoreMode === "enabled";
      const candidateCurrent = current.version === candidateVersion && application.image === candidateImage
        && application.version === journal.enabledApplicationVersion && !application.activeRolloutId;
      let restoredCurrent = application.image === targetImage && application.version > journal.enabledApplicationVersion!;
      if (restoredCurrent && application.activeRolloutId) {
        for (let attempt = 0; attempt < 36 && application.activeRolloutId; attempt += 1) {
          await sleepAbortably(deps, 5_000);
          try { application = await readContainerApplication(deps, applicationId); }
          catch { return denied("provider_drift"); }
          if (application.image !== targetImage || application.version <= journal.enabledApplicationVersion!) return denied("provider_drift");
        }
        restoredCurrent = !application.activeRolloutId;
      }
      if (!candidateCurrent && !restoredCurrent) return denied("provider_drift");

      if (candidateCurrent) {
        // Cloudflare exposes no documented rollout lookup/idempotency readback. A
        // second request is possible only when explicitly authorized and durably
        // consumed once before POST; later invocations can never replay it.
        const explicitRetry = "container_restore_explicit_authorized_retry";
        if (authorizeOneContainerRestore && !journal.checks.includes(explicitRetry)) {
          const raw = await readVersion(deps, current.version);
          try { verifyCandidateVersion(raw, current.version, journal.commit, candidateEnabled); } catch { return denied("provider_drift"); }
          if (!await verifyRecoveryTarget(deps, {
            version: current.version, containerId: applicationId, image: journal.enabledImage!,
            applicationVersion: journal.enabledApplicationVersion!,
            enabled: candidateEnabled, requireInactive: !candidateEnabled, sourceRevision: journal.commit,
            state: candidateEnabled ? "enabled" : "disabled",
          })) return denied("provider_drift");
          if (await readRemoteHead(deps, repo.nameWithOwner) !== remote.head) return denied("journal_head_changed");
          journal.checks.push(explicitRetry);
          try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
          catch (error) {
            if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
            return denied("journal_invalid");
          }
          await verifyLeaseHead(deps, repo.nameWithOwner, journal);
          let restoredApplicationVersion: number;
          try {
            restoredApplicationVersion = await restoreStartingContainerImage(deps, journal, {
              id: applicationId, image: journal.enabledImage!, version: journal.enabledApplicationVersion!,
            });
          } catch (error) { return retainFailure(error); }
          try { application = await readContainerApplication(deps, applicationId); }
          catch { return retainFailure(new DeployFailure("cloudflare_container_restore_uncertain")); }
          let restoredContainer: ContainerState;
          try { restoredContainer = await readContainer(deps, applicationId); }
          catch { return retainFailure(new DeployFailure("cloudflare_container_restore_uncertain")); }
          if (application.image !== targetImage || application.version !== restoredApplicationVersion || application.activeRolloutId
            || restoredContainer.id !== applicationId || restoredContainer.image !== journal.startingImage
            || restoredContainer.version !== restoredApplicationVersion) return denied("provider_drift");
          journal.restoredApplicationVersion = restoredApplicationVersion;
          journal.transitions.push({ phase: "container_restore", kind: "result", at: deps.now().toISOString(), version: journal.enabledVersion });
          try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
          catch (error) {
            if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
            return denied("journal_invalid");
          }
          restoredCurrent = true;
        } else {
          // Record the unknown result while retaining the lease. In particular, an
          // already-consumed explicit authorization is never accepted a second time.
          if (journal.recoveryFailure !== "cloudflare_container_restore_uncertain") {
            journal.recoveryFailure = "cloudflare_container_restore_uncertain";
            try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
            catch (error) {
              if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
              return denied("journal_invalid");
            }
          }
          return denied("provider_outcome_unknown");
        }
      }
      if (!journal.restoredApplicationVersion) {
        if (!restoredCurrent || application.version <= journal.enabledApplicationVersion!) return denied("provider_drift");
        journal.restoredApplicationVersion = application.version;
        journal.transitions.push({ phase: "container_restore", kind: "result", at: deps.now().toISOString(), version: journal.enabledVersion });
        try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
        catch (error) {
          if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
          return denied("journal_invalid");
        }
      }

      let workerRestoreJustAuthorized = false;
      if (journal.transitions.at(-1)?.phase === "container_restore") {
        let candidate: CurrentDeployment;
        try {
          candidate = await readCurrent(deps);
          const raw = await readVersion(deps, candidate.version);
          verifyCandidateVersion(raw, candidate.version, journal.commit, candidateEnabled);
          if (interruptedRestoreMode === "disabled") {
            if (candidate.version !== journal.disabledVersion) return denied("provider_drift");
            const disabledTarget: RecoveryTarget = {
              version: journal.disabledVersion!, containerId: applicationId, image: journal.startingImage!,
              applicationVersion: journal.restoredApplicationVersion!,
              enabled: false, requireInactive: true, sourceRevision: journal.commit, state: "disabled",
            };
            if (!await verifyRecoveryTarget(deps, disabledTarget)) return denied("provider_drift");
          } else {
            if (candidate.version !== journal.enabledVersion || parseVersionState(raw, candidate.version).enabled !== true) return denied("provider_drift");
            const restoredContainer = await readContainer(deps, applicationId);
            if (restoredContainer.id !== applicationId || restoredContainer.image !== journal.startingImage
              || restoredContainer.version !== journal.restoredApplicationVersion) return denied("provider_drift");
          }
        } catch { return denied("provider_drift"); }
        if (await readRemoteHead(deps, repo.nameWithOwner) !== journal.remoteCommit) return denied("journal_head_changed");
        journal.transitions.push({ phase: "worker_restore", kind: "intent", at: deps.now().toISOString(), version: journal.startingVersion });
        try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
        catch (error) {
          if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
          return denied("journal_invalid");
        }
        workerRestoreJustAuthorized = true;
      }
      let workerRestored = false;
      try { workerRestored = Boolean(await verifyRecoveryTarget(deps, {
        ...startingTarget!, applicationVersion: journal.restoredApplicationVersion!, enabled: true, state: "restored",
      })); } catch { /* checked below */ }
      if (!workerRestored) {
        if (!workerRestoreJustAuthorized || journal.transitions.at(-1)?.phase !== "worker_restore"
          || journal.transitions.at(-1)?.kind !== "intent") return denied("provider_drift");
        try {
          await verifyLeaseHead(deps, repo.nameWithOwner, journal);
          await wrangler(deps, ["rollback", journal.startingVersion!, "--message", `Reconcile interrupted accepted-release restore ${journal.operationId.slice(0, 8)}`, "--yes"], 120_000);
        } catch { return denied("provider_drift"); }
        try { workerRestored = Boolean(await verifyRecoveryTarget(deps, {
          ...startingTarget!, applicationVersion: journal.restoredApplicationVersion!, enabled: true, state: "restored",
        })); } catch { workerRestored = false; }
        if (!workerRestored) return denied("provider_drift");
      }
      if (journal.transitions.at(-1)?.kind === "intent") {
        journal.transitions.push({ phase: "worker_restore", kind: "result", at: deps.now().toISOString(), version: journal.startingVersion });
        try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
        catch (error) {
          if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
          return denied("journal_invalid");
        }
      }
      try {
        const serviceToken = await (deps.issueServiceToken ?? issueServiceToken)(deps.env, { fetcher: deps.fetcher, signal: deps.signal });
        // A Worker rollback can become visible at the edge a few seconds after
        // exact Worker/Container readback. Retry that credential-free probe
        // within the existing bounded acceptance window before retaining an
        // otherwise restored pair as unresolved.
        await retryAcceptance(deps, ["production:probe"], { NEMLIG_EXPECTED_REVISION: journal.startingRevision! }, 3, "edge", "edge", "edge_acceptance_failed", 120_000);
        await retryAcceptance(deps, ["production:test:features", "--service", "--initialize-only", "--wake-only"], {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: journal.startingRevision!,
        }, 1, "read_only", "service", "service_fixture_acceptance_failed", 120_000, 1);
        await retryAcceptance(deps, ["production:test:features", "--service", "--initialize-only"], {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: journal.startingRevision!,
        }, 1, "read_only", "service", "service_fixture_acceptance_failed", 120_000, 1);
        await retryAcceptance(deps, ["production:test:features", "--service"], {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: journal.startingRevision!,
        }, 1, "read_only", "service", "service_fixture_acceptance_failed", 120_000, 1);
        if (await readRemoteHead(deps, repo.nameWithOwner) !== journal.remoteCommit) return denied("journal_head_changed");
        journal.checks = [...new Set([...journal.checks, "starting_version_restored", "edge_acceptance", "service_fixture_acceptance"])];
        journal.lastVerifiedState = "restored";
        journal.rollback = "restored";
        try { await appendRemoteJournal(deps, repo.nameWithOwner, journal); }
        catch (error) {
          if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
          return denied("journal_invalid");
        }
      } catch (error) { return retainFailure(error); }
      return { operation, originalRunnerStopped, reconciled: true, reason: "eligible", state: "restored" };
    }

    if (rollbackTarget || noopEnableTarget) {
      const target = rollbackTarget ?? noopEnableTarget!;
      let observedVersion: string | undefined;
      try { observedVersion = await verifyRecoveryTarget(deps, target); } catch { observedVersion = undefined; }
      if (!observedVersion) {
        if (rollbackTarget || !interruptedEnableTarget) return denied("provider_drift");
      } else {
        if (await readRemoteHead(deps, repo.nameWithOwner) !== remote.head) return denied("journal_head_changed");
        const reconciled: DeploymentJournal = rollbackTarget ? {
          ...journal,
          remoteCommit: remote.head,
          disabledVersion: observedVersion,
          disabledImage: target.image,
          disabledApplicationVersion: target.applicationVersion,
          checks: [...new Set([...journal.checks, "disabled_routes", "container_inactive"])],
          lastVerifiedState: "disabled",
          rollback: "restored",
          transitions: [...journal.transitions, {
            phase: "rollback", kind: "result", at: deps.now().toISOString(), version: observedVersion,
          }],
        } : {
          ...journal,
          remoteCommit: remote.head,
          checks: [...new Set([...journal.checks, "disabled_routes", "container_inactive", "starting_version_restored"])],
          lastVerifiedState: "restored",
          transitions: [...journal.transitions, {
            phase: "enable_deploy", kind: "result", at: deps.now().toISOString(), version: observedVersion,
          }],
        };
        journalJson(reconciled);
        try { await appendRemoteJournal(deps, repo.nameWithOwner, reconciled); }
        catch (error) {
          if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
          return denied("journal_invalid");
        }
        return { operation, originalRunnerStopped, reconciled: true, reason: "eligible", state: "disabled" };
      }
    }

    if (!startingTarget || (!interruptedRollbackTarget && !interruptedEnableTarget)) return denied("pending_or_unknown");
    if (interruptedEnableTarget) {
      let enabledVersion: string | undefined;
      try { enabledVersion = await verifyRecoveryTarget(deps, interruptedEnableTarget); } catch { enabledVersion = undefined; }
      if (!enabledVersion) return denied("provider_drift");
      if (await readRemoteHead(deps, repo.nameWithOwner) !== remote.head) return denied("journal_head_changed");
      const rollbackIntent: DeploymentJournal = {
        ...journal,
        remoteCommit: remote.head,
        enabledVersion,
        rollback: "attempted",
        transitions: [...journal.transitions,
          { phase: "enable_deploy", kind: "result", at: deps.now().toISOString(), version: enabledVersion },
          { phase: "rollback", kind: "intent", at: deps.now().toISOString(), version: journal.startingVersion }],
      };
      journalJson(rollbackIntent);
      try { await appendRemoteJournal(deps, repo.nameWithOwner, rollbackIntent); }
      catch (error) {
        if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
        return denied("journal_invalid");
      }
      await verifyLeaseHead(deps, repo.nameWithOwner, rollbackIntent);
      await wrangler(deps, ["rollback", journal.startingVersion!, "--message", `Fail-closed recovery after interrupted ${journal.commit.slice(0, 7)} release`, "--yes"], 120_000);
      journal.remoteCommit = rollbackIntent.remoteCommit;
      Object.assign(journal, rollbackIntent);
    }

    let restoredVersion: string | undefined;
    try { restoredVersion = await verifyRecoveryTarget(deps, startingTarget); } catch { restoredVersion = undefined; }
    if (!restoredVersion) return denied("provider_drift");
    const terminalParent = interruptedEnableTarget ? journal.remoteCommit : remote.head;
    if (!terminalParent || await readRemoteHead(deps, repo.nameWithOwner) !== terminalParent) return denied("journal_head_changed");
    const reconciled: DeploymentJournal = {
      ...journal,
      remoteCommit: terminalParent,
      checks: [...new Set([...journal.checks, "disabled_routes", "container_inactive", "starting_version_restored"])],
      lastVerifiedState: "restored",
      rollback: "restored",
      transitions: [...journal.transitions, {
        phase: "rollback", kind: "result", at: deps.now().toISOString(), version: restoredVersion,
      }],
    };
    journalJson(reconciled);
    try { await appendRemoteJournal(deps, repo.nameWithOwner, reconciled); }
    catch (error) {
      if (error instanceof DeployFailure && error.code === "remote_journal_parent_invalid") return denied("journal_head_changed");
      return denied("journal_invalid");
    }
    return { operation, originalRunnerStopped, reconciled: true, reason: "eligible", state: "disabled" };
  } catch (error) {
    const reason = error instanceof DeployFailure && error.code === "remote_journal_missing" ? "journal_missing" : "journal_invalid";
    return denied(reason);
  }
}

const knownTerminal = (journal: DeploymentJournal): boolean => {
  if (!journal.completedAt || journal.outcome === "running" || journal.lastVerifiedState === "unknown") return false;
  const result = journal.transitions.at(-1);
  if (result?.kind !== "result") return false;
  if (journal.outcome === "success") return journal.lastVerifiedState === "enabled" && result.phase === "enable_deploy"
    && result.version === journal.enabledVersion && ["enabled_version", "edge_acceptance"].every((check) => journal.checks.includes(check))
    && (journal.checks.includes("image_reused") || journal.checks.includes("container_rollout"))
    && (journal.checks.includes("authenticated_read_only_acceptance") || journal.checks.includes("service_fixture_acceptance"));
  if (journal.lastVerifiedState === "disabled") return ["disabled_deploy", "rollback"].includes(result.phase) && result.version === journal.disabledVersion
    && ["disabled_routes", "container_inactive"].every((check) => journal.checks.includes(check));
  return journal.lastVerifiedState === "restored" && result.version === journal.startingVersion
    && journal.checks.includes("starting_version_restored")
    && (!["container_restore_reconciliation_attempted", "container_restore_explicit_authorized_retry"].some((check) => journal.checks.includes(check))
      || ["edge_acceptance", "service_fixture_acceptance"].every((check) => journal.checks.includes(check)))
    && ((journal.rollback === "restored" && ["rollback", "worker_restore"].includes(result.phase))
      || (journal.rollback === "not_needed" && result.phase === "enable_deploy"));
};

const acceptedTerminalMakesLifecycleReadRedundant = (journal: DeploymentJournal): boolean =>
  (journal.lastVerifiedState === "enabled"
    && knownTerminal(journal)
    && journal.checks.includes("edge_acceptance")
    && (journal.checks.includes("authenticated_read_only_acceptance") || journal.checks.includes("service_fixture_acceptance")))
  || (journal.lastVerifiedState === "restored"
    && ["container_restore_explicit_authorized_retry", "starting_version_restored", "edge_acceptance", "service_fixture_acceptance"]
      .every((check) => journal.checks.includes(check)));

export async function inspectDeploymentRecovery(operation: string, deps: DeployDependencies, originalRunnerStopped = false): Promise<RecoveryInspection> {
  if (!operationId.test(operation)) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "operation_mismatch", state: "unknown" };
  try {
    const repo = await repoIdentity(deps);
    const { journal } = await readRemoteJournal(deps, repo.nameWithOwner);
    const expected = expectedRecovery(journal);
    if (journal.operationId !== operation) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "operation_mismatch", state: "unknown" };
    if (!knownTerminal(journal) || !expected) {
      const reason = pendingInterruptedContainerRestore(journal)
        && journal.recoveryFailure === "cloudflare_container_restore_uncertain"
        ? "provider_outcome_unknown" : "pending_or_unknown";
      return { operation, originalRunnerStopped, cleanupEligible: false, reason, state: "unknown" };
    }
    if (!await verifyRecoveryTarget(deps, expected, !acceptedTerminalMakesLifecycleReadRedundant(journal))) {
      return { operation, originalRunnerStopped, cleanupEligible: false, reason: "provider_drift", state: "unknown" };
    }
    if (!originalRunnerStopped) return { operation, originalRunnerStopped, cleanupEligible: false, reason: "runner_not_stopped", state: expected.state };
    return { operation, originalRunnerStopped, cleanupEligible: true, reason: "eligible", state: expected.state };
  } catch (error) {
    const reason = error instanceof DeployFailure && error.code === "remote_journal_missing" ? "journal_missing" : "journal_invalid";
    return { operation, originalRunnerStopped, cleanupEligible: false, reason, state: "unknown" };
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
  if (await readRemoteHead(deps, repository) !== undefined) return false;
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
  if (journal.operationId !== operation || !knownTerminal(journal) || !expected) return false;
  if (!await verifyRecoveryTarget(deps, expected, !acceptedTerminalMakesLifecycleReadRedundant(journal))) return false;
  // Compare the containing ref head, never journal.remoteCommit supplied by the blob.
  return releaseDeploymentLeases(deps, repo.nameWithOwner, remote.head, operation);
}

type SourceMode = "routine" | "recovery";

const verifySource = async (deps: DeployDependencies, commit: string, repo: { nameWithOwner: string; url: string }, sourceMode: SourceMode = "routine"): Promise<number> => {
  await runAt(deps, deps.repoRoot, "gh", ["auth", "status", "-h", "github.com"]);
  await runAt(deps, deps.repoRoot, "git", ["-c", "credential.helper=!gh auth git-credential", "fetch", repo.url, "main:refs/remotes/origin/main"]);
  const [head, status] = await Promise.all([
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "HEAD"]),
    runAt(deps, deps.repoRoot, "git", ["status", "--porcelain"]),
  ]);
  if (head !== commit || status !== "") fail("source_revision_mismatch");
  try { await runAt(deps, deps.repoRoot, "git", ["merge-base", "--is-ancestor", commit, "origin/main"]); }
  catch { fail(sourceMode === "recovery" ? "recovery_source_invalid" : "source_revision_mismatch"); }
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
  const branchPolicy = object(environment.deployment_branch_policy);
  if (environment.can_admins_bypass !== false || rules.length !== 1 || rules[0]?.type !== "branch_policy"
    || branchPolicy?.protected_branches !== false || branchPolicy.custom_branch_policies !== true
  ) fail("github_environment_not_ready");
  const branches = await githubEnvironment(deps, repository, "environments/nemlig-production/deployment-branch-policies");
  const policies = Array.isArray(branches.branch_policies) ? branches.branch_policies.map(object) : [];
  if (policies.length !== 1 || policies[0]?.name !== "main" || policies[0]?.type !== "branch") fail("github_environment_not_ready");
};

export type ProductionPreflight =
  | { state: "ready"; commit: string; ciRunId: number }
  | { state: "blocked_by_existing_lease"; commit: string; ciRunId: number; leaseHead: string };

/** Read-only exact-main CI and main-only environment proof for the deployment workflow. */
export async function preflightProductionDeploy(commit: string, deps: DeployDependencies, sourceMode: SourceMode = "routine"): Promise<ProductionPreflight> {
  if (!fullSha.test(commit)) fail("invalid_commit");
  const repo = await repoIdentity(deps);
  const ciRunId = await verifySource(deps, commit, repo, sourceMode);
  await verifyGithubEnvironment(deps, repo.nameWithOwner);
  if (sourceMode === "routine") {
    const leaseHead = await readRemoteHead(deps, repo.nameWithOwner);
    if (leaseHead) return { state: "blocked_by_existing_lease", commit, ciRunId, leaseHead };
  }
  return { state: "ready", commit, ciRunId };
}

const verifyDisabledRoutes = async (deps: DeployDependencies): Promise<void> => {
  let lastFailure: "disabled_route_unavailable" | "disabled_route_mismatch" = "disabled_route_unavailable";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let bothDisabled = true;
    for (const endpoint of [customMcp, workersMcp]) {
      deps.signal?.throwIfAborted();
      const timeout = AbortSignal.timeout(10_000);
      const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
      try {
        const response = await deps.fetcher(endpoint, { signal });
        if (response.status !== 503 || await response.text() !== "MCP temporarily disabled") {
          bothDisabled = false;
          lastFailure = "disabled_route_mismatch";
        }
      } catch {
        deps.signal?.throwIfAborted();
        bothDisabled = false;
        lastFailure = "disabled_route_unavailable";
      }
    }
    if (bothDisabled) return;
    if (attempt < 5) await sleepAbortably(deps);
  }
  fail(lastFailure);
};

const sleepAbortably = async (deps: DeployDependencies, durationMs = 5_000): Promise<void> => {
  if (!deps.signal) return await deps.sleep(durationMs);
  await new Promise<void>((resolvePromise, reject) => {
    const abort = () => reject(new DeployFailure("command_cancelled"));
    deps.signal!.addEventListener("abort", abort, { once: true });
    void deps.sleep(durationMs).then(() => {
      deps.signal!.removeEventListener("abort", abort);
      resolvePromise();
    }, (error) => {
      deps.signal!.removeEventListener("abort", abort);
      reject(error);
    });
  });
};

const acceptanceCommandTimeoutMs = 120_000;
// Cloudflare activates the Worker before its Container rollout completes. The
// strict MCP initialization is the candidate-start proof, so reserve one
// bounded request for it rather than polling a post-request lifecycle state.
const serviceStartupEvidenceReserveMs = acceptanceCommandTimeoutMs;

const waitForInactive = async (deps: DeployDependencies, applicationId: string): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    if (instancesInactive(await wrangler(deps, ["containers", "instances", applicationId, "--json"]))) return;
    await sleepAbortably(deps);
  }
  fail("container_inactive_timeout");
};

const runningInstanceVersion = (raw: string, minimumVersion: number): number | null => {
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
    return version >= minimumVersion ? version : null;
  }
  if (["provisioning", "stopping", "stopped"].includes(state as string)) return null;
  return fail("cloudflare_instances_invalid");
};

const runningInstanceMatches = (raw: string, expectedVersion: number): boolean =>
  runningInstanceVersion(raw, expectedVersion) === expectedVersion;

/**
 * Before an MCP call can wake or query a Container, prove that a pre-existing
 * instance has finished the candidate rollout. An inactive application is
 * valid: the first authenticated call will start the candidate image.
 */
const waitForAcceptedInstance = async (deps: DeployDependencies, applicationId: string, expectedVersion: number): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    const raw = await wrangler(deps, ["containers", "instances", applicationId, "--json"]);
    if (instancesInactive(raw)) return;
    const version = runningInstanceVersion(raw, expectedVersion);
    if (version !== null) {
      if (version !== expectedVersion) fail("cloudflare_deployment_drift");
      return;
    }
    if (attempt < 35) await sleepAbortably(deps);
  }
  fail("container_instance_timeout");
};

const waitForCandidateContainer = async (deps: DeployDependencies, workerVersion: string, starting: ContainerState, image: string): Promise<ContainerState> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await verifyCurrent(deps, workerVersion);
    const current = await readContainer(deps, starting.id);
    if (current.id !== starting.id) fail("cloudflare_deployment_drift");
    if (current.image === image) return current;
    if (current.image !== starting.image || current.version !== starting.version) fail("cloudflare_deployment_drift");
    if (attempt < 35) await sleepAbortably(deps);
  }
  return fail("container_instance_timeout");
};

const parseAcceptanceFailure = (stdout: string | undefined, profile: AcceptanceFailureEvidence["profile"], stage: AcceptanceFailureEvidence["stage"]): AcceptanceFailureEvidence | undefined => {
  if (!stdout) return undefined;
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    if (!line.startsWith("{")) continue;
    let value: Record<string, unknown> | undefined;
    try { value = object(JSON.parse(line)); } catch { continue; }
    if (!value || value.schema !== 1 || value.profile !== profile
      || typeof value.failureCategory !== "string" || !acceptanceFailureCategories.has(value.failureCategory)
      || !Array.isArray(value.failed) || value.failed.length !== 1
      || !(value.failed[0] === value.failureCategory || (value.failureCategory === "feature_failed"
        && ["product_viewer_html_mismatch", "service_tool_inventory_mismatch", "service_resource_inventory_mismatch", "service_runtime_version_mismatch"].includes(value.failed[0])))
      || typeof value.lastCompletedBoundary !== "string"
      || !/^[A-Za-z0-9_:-]{1,64}$/u.test(value.lastCompletedBoundary)
      || !Array.isArray(value.correlationIds) || value.correlationIds.length > 16
      || !value.correlationIds.every((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id))) continue;
    const evidence: AcceptanceFailureEvidence = {
      stage, profile, category: value.failureCategory as AcceptanceFailureEvidence["category"],
      lastCompletedBoundary: value.lastCompletedBoundary, correlationIds: value.correlationIds as string[],
    };
    if (!validAcceptanceFailure(evidence)) return undefined;
    // The report's failure identifier is allowlisted above; print only that
    // identifier, never child stdout, request data, or authentication details.
    console.error(`acceptance_failure_code=${value.failed[0]}`);
    return evidence;
  }
  return undefined;
};

const retryAcceptance = async (
  deps: DeployDependencies,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  attempts: number,
  stage: AcceptanceFailureEvidence["stage"],
  profile: AcceptanceFailureEvidence["profile"],
  failure: "edge_acceptance_failed" | "service_fixture_acceptance_failed" | "authenticated_read_only_acceptance_failed",
  runtimeConvergenceMs?: number,
  staleRuntimeAttemptLimit = 180,
): Promise<void> => {
  let lastEvidence: AcceptanceFailureEvidence | undefined;
  const convergenceDeadline = runtimeConvergenceMs === undefined ? undefined : deps.now().getTime() + runtimeConvergenceMs;
  const remainingMs = (): number => convergenceDeadline === undefined ? Infinity : convergenceDeadline - deps.now().getTime();
  let staleRuntimeAttempts = 0;
  for (let attempt = 0; attempt < attempts;) {
    if (remainingMs() <= 0) throw new AcceptanceFailure(failure, lastEvidence);
    try {
      await runAt(deps, deps.packageRoot, "pnpm", args, {
        timeoutMs: Math.min(acceptanceCommandTimeoutMs, remainingMs()), env, captureFailureStdout: (stdout) => parseAcceptanceFailure(stdout, profile, stage),
      });
      if (remainingMs() <= 0) throw new AcceptanceFailure(failure, lastEvidence);
      return;
    } catch (error) {
      if (error instanceof AcceptanceFailure) throw error;
      const evidence = object(error)?.acceptanceFailure;
      if (validAcceptanceFailure(evidence)) lastEvidence = evidence;
      deps.signal?.throwIfAborted();
      if (deps.signal?.aborted) throw new DeployFailure("command_cancelled");
      const staleRuntime = profile === "service" && validAcceptanceFailure(evidence)
        && evidence.category === "feature_failed" && evidence.lastCompletedBoundary === "service_runtime_version_read";
      if (staleRuntime) staleRuntimeAttempts += 1;
      else attempt += 1;
      if ((staleRuntime && (runtimeConvergenceMs === undefined || staleRuntimeAttempts >= staleRuntimeAttemptLimit)) || attempt >= attempts || remainingMs() <= 0) {
        throw new AcceptanceFailure(failure, lastEvidence);
      }
      const delayMs = staleRuntime ? 15_000 : 5_000;
      if (remainingMs() <= delayMs) throw new AcceptanceFailure(failure, lastEvidence);
      await sleepAbortably(deps, delayMs);
    }
  }
};

const verifyCurrent = async (deps: DeployDependencies, expected: string): Promise<void> => {
  if ((await readCurrent(deps)).version !== expected) fail("cloudflare_deployment_drift");
};

const verifyLeaseHead = async (deps: DeployDependencies, repository: string, journal: DeploymentJournal): Promise<void> => {
  if (!journal.remoteCommit || await readRemoteHead(deps, repository) !== journal.remoteCommit) fail("remote_deployment_lease_changed");
};

const rollbackToDisabled = async (deps: DeployDependencies, journal: DeploymentJournal, containerId: string): Promise<void> => {
  const { disabledVersion, disabledImage, disabledApplicationVersion, startingConfigDigest } = journal;
  if (!disabledVersion || !disabledImage || !disabledApplicationVersion || !startingConfigDigest) {
    fail("cloudflare_deployment_drift");
  }
  const version = disabledVersion as string;
  const image = disabledImage as string;
  const applicationVersion = disabledApplicationVersion as number;
  const configDigest = startingConfigDigest as string;
  journal.rollback = "attempted";
  await wrangler(deps, ["rollback", version, "--message", `Automated rollback after failed ${journal.commit.slice(0, 7)} release`, "--yes"], 120_000);
  if (!await verifyRecoveryTarget(deps, {
    version, containerId, image, applicationVersion, configDigest, enabled: false, state: "disabled",
  })) fail("cloudflare_deployment_drift");
  await verifyDisabledRoutes(deps);
  journal.rollback = "restored";
  journal.lastVerifiedState = "disabled";
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
  const operationDurationMs = Math.min(inputDeps.operationDeadlineMs ?? 25 * 60_000, 25 * 60_000);
  const operationDeadlineAt = inputDeps.now().getTime() + operationDurationMs;
  const operationDeadline = setTimeout(abortOperation, operationDurationMs);
  const recovery = inputDeps.acceptanceMode === "recovery";
  const service = inputDeps.env.GITHUB_ACTIONS === "true" || inputDeps.acceptanceMode === "service" || recovery;
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
    deliveryMode: recovery ? "recovery" : "routine",
    checks: [],
    lastVerifiedState: "unchanged",
    rollback: "not_needed",
    outcome: "running",
    transitions: [],
  };
  let providerMutation = false;
  let mutationUncertain = false;
  let starting: VersionState | undefined;
  let startingServiceVersion: string | undefined;
  let startingContainer: ContainerState | undefined;
  let configured: EffectiveConfig | undefined;
  let repository = "";
  let journalPath = "";
  let lockPath = "";
  let routine = false;
  let restoredReleaseProven = false;
  let transition: ((phase: JournalPhase, kind: JournalKind, version?: string) => Promise<void>) | undefined;

  try {
    deps.signal?.throwIfAborted();
    if (!service && !deps.env.NEMLIG_MCP_ACCESS_TOKEN?.trim()) fail("owner_access_token_required");
    const repo = await repoIdentity(deps);
    repository = repo.nameWithOwner;
    journal.ciRunId = await verifySource(deps, commit, repo, recovery ? "recovery" : "routine");
    if (service) {
      if (deps.env.NEMLIG_CI_ACCEPTANCE_READY !== "true") fail("service_acceptance_not_ready");
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

    if (await verifySource(deps, commit, repo, recovery ? "recovery" : "routine") !== journal.ciRunId) fail("github_ci_invalid");
    const start = await readCurrent(deps);
    const startingRaw = await readVersion(deps, start.version);
    starting = parseVersionState(startingRaw, start.version);
    verifyCandidateVersion(startingRaw, starting.id, starting.revision, starting.enabled);
    if (!recovery) {
      try { await runAt(deps, deps.repoRoot, "git", ["merge-base", "--is-ancestor", starting.revision, commit]); }
      catch { fail("candidate_does_not_supersede_runtime"); }
    }
    const startingConfig = versionConfig(startingRaw);
    configured = candidateConfig(await readLocalConfig(deps), startingConfig);
    if (configured.digest !== startingConfig.digest) fail("cloudflare_runtime_safety_mismatch");
    if (service) {
      const clientId = inputDeps.env.NEMLIG_MCP_SERVICE_CLIENT_ID?.trim();
      if (!clientId || configured.vars.get("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED") !== "true"
        || configured.vars.get("NEMLIG_MCP_SERVICE_CLIENT_ID") !== clientId) fail("service_acceptance_not_ready");
    }
    startingServiceVersion = service ? await packageVersionAtRevision(deps, starting.revision) : undefined;
    startingContainer = await readContainer(deps);
    journal.startingVersion = starting.id;
    journal.startingRevision = starting.revision;
    journal.startingContainerId = startingContainer.id;
    journal.startingImage = startingContainer.image;
    journal.startingApplicationVersion = startingContainer.version;
    journal.startingConfigDigest = startingConfig.digest;
    journal.startingEnabled = starting.enabled;
    journal.checks.push("source_and_auth_preflight", ...(recovery ? ["recovery_source"] : []), "exclusive_lease", "starting_state_recorded");
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

    routine = !recovery;
    if (routine) {
      const cloudflareApplication = await readContainerApplication(deps, startingContainer.id);
      const startingImage = `registry.cloudflare.com/${deps.env.CLOUDFLARE_ACCOUNT_ID}/${containerApplication}@${startingContainer.image}`;
      if (cloudflareApplication.image !== startingImage || cloudflareApplication.version !== startingContainer.version
        || cloudflareApplication.activeRolloutId) fail("cloudflare_deployment_drift");
    }
    let enabledId: string;
    let candidateImage: string;
    let enabledContainer: ContainerState;
    if (routine) {
      await transition("enable_deploy", "intent", starting.id);
      await verifyCurrent(deps, starting.id);
      await verifyLeaseHead(deps, repository, journal);
      providerMutation = true;
      mutationUncertain = true;
      const enabledOutput = await wrangler(deps, ["deploy", ...deployVars(configured, true, commit), "--containers-rollout", "immediate",
        "--message", `Automated production release at ${commit.slice(0, 7)}`], 600_000);
      mutationUncertain = false;
      enabledId = deployedVersionFromOutput(enabledOutput);
      candidateImage = await resolveCandidateImage(deps, enabledId);
      journal.enabledVersion = enabledId;
      await verifyCurrent(deps, enabledId);
      const enabledRaw = await readVersion(deps, enabledId);
      verifyCandidateVersion(enabledRaw, enabledId, commit, true);
      verifyConfig(enabledRaw, configured);
      enabledContainer = await waitForCandidateContainer(deps, enabledId, startingContainer, candidateImage);
      journal.enabledImage = enabledContainer.image;
      journal.enabledApplicationVersion = enabledContainer.version;
      journal.lastVerifiedState = "enabled";
      journal.checks.push("enabled_version", "container_rollout");
      await transition("enable_deploy", "result", enabledId);
    } else {
      await transition("disabled_deploy", "intent", starting.id);
      await verifyCurrent(deps, starting.id);
      await verifyLeaseHead(deps, repository, journal);
      providerMutation = true;
      mutationUncertain = true;
      const disabledOutput = await wrangler(deps, ["deploy", ...deployVars(configured, false, commit),
        "--message", `Automated production release disabled gate at ${commit.slice(0, 7)}`], 600_000);
      mutationUncertain = false;
      const disabledId = deployedVersionFromOutput(disabledOutput);
      candidateImage = await resolveCandidateImage(deps, disabledId);
      await verifyCurrent(deps, disabledId);
      const disabledRaw = await readVersion(deps, disabledId);
      verifyCandidateVersion(disabledRaw, disabledId, commit, false);
      verifyConfig(disabledRaw, configured);
      const disabledContainer = await waitForCandidateContainer(deps, disabledId, startingContainer, candidateImage);
      await verifyDisabledRoutes(deps);
      await waitForInactive(deps, disabledContainer.id);
      await verifyCurrent(deps, disabledId);
      await verifyLeaseHead(deps, repository, journal);
      const provenDisabledContainer = await readContainer(deps, disabledContainer.id);
      if (provenDisabledContainer.id !== disabledContainer.id || provenDisabledContainer.image !== candidateImage
        || provenDisabledContainer.version !== disabledContainer.version) fail("cloudflare_deployment_drift");
      journal.disabledVersion = disabledId;
      journal.disabledImage = candidateImage;
      journal.disabledApplicationVersion = provenDisabledContainer.version;
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
      enabledId = deployedVersionFromOutput(enabledOutput);
      journal.enabledVersion = enabledId;
      await verifyCurrent(deps, enabledId);
      const enabledRaw = await readVersion(deps, enabledId);
      verifyCandidateVersion(enabledRaw, enabledId, commit, true);
      verifyConfig(enabledRaw, configured);
      enabledContainer = await readContainer(deps, disabledContainer.id);
      if (enabledContainer.id !== disabledContainer.id || enabledContainer.image !== candidateImage || enabledContainer.version !== disabledContainer.version) {
        fail("container_image_changed_during_enable");
      }
      journal.enabledImage = enabledContainer.image;
      journal.enabledApplicationVersion = enabledContainer.version;
      journal.lastVerifiedState = "enabled";
      journal.checks.push("enabled_version", "image_reused");
      await transition("enable_deploy", "result", enabledId);
    }
    // The Worker becomes live before Cloudflare replaces an existing Container.
    // Do not let authenticated MCP acceptance repeatedly query the previous
    // process: first prove either the candidate instance is running or there
    // is no instance yet for the first request to start.
    await waitForAcceptedInstance(deps, enabledContainer.id, enabledContainer.version);
    // Initialize MCP, then prove its exact server version before the fixture.
    if (service) {
      const restoreReserveMs = 12 * 60_000;
      const edgeBudget = Math.max(0, Math.min(60_000, operationDeadlineAt - deps.now().getTime() - restoreReserveMs));
      await retryAcceptance(deps, ["production:probe"], { NEMLIG_EXPECTED_REVISION: commit }, 12, "edge", "edge", "edge_acceptance_failed", edgeBudget);
      await retryAcceptance(deps, ["production:test:features", "--service", "--initialize-only", "--wake-only"], {
        NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: commit,
      }, 12, "read_only", "service", "service_fixture_acceptance_failed",
      Math.max(0, operationDeadlineAt - deps.now().getTime() - restoreReserveMs - serviceStartupEvidenceReserveMs));
      await retryAcceptance(deps, ["production:test:features", "--service", "--initialize-only"], {
        NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: commit,
      }, 12, "read_only", "service", "service_fixture_acceptance_failed",
      Math.max(0, operationDeadlineAt - deps.now().getTime() - restoreReserveMs - serviceStartupEvidenceReserveMs));
    } else {
      await retryAcceptance(deps, ["production:probe"], { NEMLIG_EXPECTED_REVISION: commit }, 12, "edge", "edge", "edge_acceptance_failed");
    }
    await retryAcceptance(deps, ["production:test:features", ...(service ? ["--service"] : [])],
      service ? { NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: commit } : {}, service ? 12 : 1,
      "read_only", service ? "service" : "live-user",
      service ? "service_fixture_acceptance_failed" : "authenticated_read_only_acceptance_failed",
      service ? Math.max(0, Math.min(11 * 60_000, operationDeadlineAt - deps.now().getTime() - 12 * 60_000)) : undefined);
    await verifyCurrent(deps, enabledId);
    await verifyLeaseHead(deps, repository, journal);
    const provenContainer = await readContainer(deps, enabledContainer.id);
    if (provenContainer.id !== enabledContainer.id || provenContainer.image !== candidateImage
      || provenContainer.version !== enabledContainer.version) {
      fail("cloudflare_deployment_drift");
    }
    journal.enabledVersion = enabledId;
    journal.checks.push("edge_acceptance", service ? "service_fixture_acceptance" : "authenticated_read_only_acceptance");
    journal.outcome = "success";
  } catch (error) {
    if (error instanceof CommandFailure && error.diagnostic) console.error(error.diagnostic);
    console.error(error instanceof Error ? error.message : "unexpected deployment failure");
    journal.outcome = "failed";
    journal.failure = error instanceof DeployFailure && deploymentFailureReasons.has(error.code) ? error.code : "unexpected_failure";
    if (error instanceof AcceptanceFailure && error.evidence) journal.acceptanceFailure = error.evidence;
    if (mutationUncertain) {
      journal.lastVerifiedState = "unknown";
    } else if (providerMutation && starting) {
      try {
        const current = await readCurrent(deps);
        const currentRaw = await readVersion(deps, current.version);
        const state = parseVersionState(currentRaw, current.version);
        const candidate = journal.enabledVersion ?? journal.disabledVersion;
        if (!candidate && !state.enabled) {
          journal.lastVerifiedState = "unknown";
        } else if (current.version !== candidate && current.version !== starting.id) {
          journal.failure = "cloudflare_deployment_drift";
          journal.lastVerifiedState = "unknown";
        } else if (routine && (error instanceof AcceptanceFailure || (error instanceof DeployFailure && routineRecoveryEligibleFailures.has(error.code)))
          && starting.enabled && state.enabled && current.version === journal.enabledVersion && startingContainer && configured && transition
          && journal.enabledImage && journal.enabledApplicationVersion
          && journal.transitions.at(-1)?.phase === "enable_deploy" && journal.transitions.at(-1)?.kind === "result") {
          verifyCandidateVersion(currentRaw, current.version, commit, true);
          verifyConfig(currentRaw, configured);
          // A routine release failure is not an emergency. Keep the Worker enabled
          // while restoring the exact accepted image; only an explicitly dispatched
          // recovery/emergency operation may deploy MCP_ENABLED=false.
          await verifyCurrent(deps, current.version);
          await verifyLeaseHead(deps, repository, journal);
          journal.rollback = "attempted";
          await transition("container_restore", "intent", current.version);
          mutationUncertain = true;
          let restoredApplicationVersion: number;
          try {
            restoredApplicationVersion = await restoreStartingContainerImage(deps, journal, {
              id: startingContainer.id,
              image: journal.enabledImage!,
              version: journal.enabledApplicationVersion!,
            });
          } catch (restoreError) {
            journal.recoveryFailure = restoreError instanceof DeployFailure && deploymentFailureReasons.has(restoreError.code)
              ? restoreError.code
              : "unexpected_failure";
            throw restoreError;
          }
          mutationUncertain = false;
          const restoredContainer = await readContainer(deps, startingContainer.id);
          if (restoredContainer.id !== startingContainer.id || restoredContainer.image !== journal.startingImage
            || restoredContainer.version !== restoredApplicationVersion) fail("cloudflare_deployment_drift");
          journal.restoredApplicationVersion = restoredApplicationVersion;
          await transition("container_restore", "result", current.version);

          await verifyCurrent(deps, current.version);
          await verifyLeaseHead(deps, repository, journal);
          await transition("worker_restore", "intent", starting.id);
          mutationUncertain = true;
          await wrangler(deps, ["rollback", starting.id, "--message", `Restore last accepted release after ${commit.slice(0, 7)} acceptance failure`, "--yes"], 120_000);
          mutationUncertain = false;
          await verifyCurrent(deps, starting.id);
          const restoredRaw = await readVersion(deps, starting.id);
          verifyCandidateVersion(restoredRaw, starting.id, starting.revision, true);
          verifyConfig(restoredRaw, configured);
          const restoredWorkerContainer = await readContainer(deps, startingContainer.id);
          if (restoredWorkerContainer.image !== journal.startingImage || restoredWorkerContainer.version !== restoredApplicationVersion) fail("cloudflare_deployment_drift");
          await transition("worker_restore", "result", starting.id);
          journal.rollback = "restored";
          journal.lastVerifiedState = "restored";
          restoredReleaseProven = true;

          await retryAcceptance(deps, ["production:probe"], { NEMLIG_EXPECTED_REVISION: starting.revision }, 1, "edge", "edge", "edge_acceptance_failed", 120_000);
          if (service) {
            await retryAcceptance(deps, ["production:test:features", "--service", "--initialize-only"], {
              NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken, NEMLIG_EXPECTED_REVISION: starting.revision,
              NEMLIG_EXPECTED_SERVICE_VERSION: startingServiceVersion!,
            }, 1, "read_only", "service", "service_fixture_acceptance_failed", 120_000, 1);
          }
          await retryAcceptance(deps, ["production:test:features", ...(service ? ["--service"] : [])],
            service ? {
              NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken,
              NEMLIG_EXPECTED_REVISION: starting.revision,
              NEMLIG_EXPECTED_SERVICE_VERSION: startingServiceVersion!,
            } : {},
            1, "read_only", service ? "service" : "live-user",
            service ? "service_fixture_acceptance_failed" : "authenticated_read_only_acceptance_failed",
            service ? 120_000 : undefined);
          await verifyCurrent(deps, starting.id);
          await verifyLeaseHead(deps, repository, journal);
          const finalRestoredContainer = await readContainer(deps, restoredContainer.id);
          if (finalRestoredContainer.image !== journal.startingImage || finalRestoredContainer.version !== restoredApplicationVersion) {
            fail("cloudflare_deployment_drift");
          }
          journal.checks.push("starting_version_restored");
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
        } else if (startingContainer && transition && journal.disabledVersion && journal.disabledImage && journal.disabledApplicationVersion) {
          await transition("rollback", "intent", journal.disabledVersion);
          await verifyCurrent(deps, current.version);
          await verifyLeaseHead(deps, repository, journal);
          await rollbackToDisabled(deps, journal, startingContainer.id);
          await transition("rollback", "result", journal.disabledVersion);
        }
      } catch (restoreError) {
        if (!restoredReleaseProven || mutationUncertain || !(restoreError instanceof AcceptanceFailure)) {
          journal.rollback = "failed";
          journal.lastVerifiedState = "unknown";
        }
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
  if (input.command === "reconcile-recovery") {
    const result = await reconcilePendingRollback(input.operation, deps, input.evidenceSaved, input.originalRunnerStopped, input.authorizeOneContainerRestore);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    if (!result.reconciled) process.exitCode = 1;
    console.log(JSON.stringify(result));
    return;
  }
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
    console.log(JSON.stringify(await preflightProductionDeploy(input.commit, deps, input.recovery ? "recovery" : "routine")));
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
