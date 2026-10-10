import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deploymentFailureReasons } from "./production-failure-reasons.js";
import { issueServiceToken } from "./service-token.js";
import {
  fetchViewerGeneration,
  verifyViewerAssets,
} from "../src/viewer-assets.js";
import {
  readLocalViewerGeneration,
  writeViewerGenerationFiles,
} from "./viewer-generation.js";

const fullSha = /^[0-9a-f]{40}$/u;
const revisionSha = /^[0-9a-f]{7,40}$/u;
const versionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const productionRepository = "mortenbroesby/everyday-assistants";
const ciWorkflowName = "CI";
const ciWorkflowPath = ".github/workflows/ci.yml";
const containerApplication =
  "nemlig-mcp-cloudflare-production-nemligmcpcontainer-production";
const imageDigest = /^sha256:[0-9a-f]{64}$/u;
const acceptanceFailureCategories = new Set([
  "input_invalid",
  "deadline_exceeded",
  "edge_failed",
  "authentication_failed",
  "transport_failed",
  "feature_failed",
  "viewer_asset_acceptance_failed",
  "mutation_failed",
  "unknown_failure",
]);

export const productionDeployUsage =
  "pnpm nemlig:production:deploy -- [--service] <40-character-main-commit>";
export function parseDeployArgs(argv: readonly string[]): string {
  const values = argv[0] === "--" ? argv.slice(1) : argv;
  if (values.length !== 1 || !fullSha.test(values[0] ?? "")) {
    fail(`usage: ${productionDeployUsage}`);
  }
  return values[0]!;
}

export interface AcceptanceFailureEvidence {
  stage: "edge" | "read_only";
  profile: "edge" | "service" | "live-user";
  category:
    | "input_invalid"
    | "deadline_exceeded"
    | "edge_failed"
    | "authentication_failed"
    | "transport_failed"
    | "feature_failed"
    | "mutation_failed"
    | "unknown_failure";
  lastCompletedBoundary: string;
  correlationIds: string[];
  failureCode?: string;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  captureFailureStdout?: (
    stdout: string,
  ) => AcceptanceFailureEvidence | undefined;
  signal?: AbortSignal;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<string>;

export interface DeployDependencies {
  repoRoot: string;
  packageRoot: string;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  fetcher: typeof fetch;
  registryFetcher?: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
  acceptanceMode?: "owner" | "service";
  issueServiceToken?: typeof issueServiceToken;
  signal?: AbortSignal;
  configReader?: (options: {
    config: string;
    env: "production";
  }) => Promise<unknown> | unknown;
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
  durableObjects: ReadonlyMap<string, string>;
  digest: string;
}

export interface ProductionDeploymentReport {
  commit: string;
  ciRunId: number;
  startingVersion?: string;
  enabledVersion?: string;
  checks: string[];
  outcome: "success" | "failed";
  failure?: string;
  acceptanceFailure?: AcceptanceFailureEvidence;
}

class DeployFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
class CommandFailure extends DeployFailure {
  constructor(
    code: string,
    readonly status?: number,
    readonly acceptanceFailure?: AcceptanceFailureEvidence,
    readonly diagnostic?: string,
  ) {
    super(code);
  }
}
class AcceptanceFailure extends DeployFailure {
  constructor(
    code: string,
    readonly evidence?: AcceptanceFailureEvidence,
    readonly attempts = 0,
  ) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new DeployFailure(code);
};
export const commandFailureDiagnostic = (
  stderr: string,
): string | undefined => {
  const http = /\bHTTP\s+([45]\d\d)\b/iu.exec(stderr)?.[1];
  if (http) {
    return `command_http_status=${http}`;
  }
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
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const validAcceptanceFailure = (
  value: unknown,
): value is AcceptanceFailureEvidence => {
  const evidence = object(value);
  return Boolean(
    evidence &&
    Object.keys(evidence).every((key) =>
      [
        "stage",
        "profile",
        "category",
        "lastCompletedBoundary",
        "correlationIds",
        "failureCode",
      ].includes(key),
    ) &&
    (evidence.stage === "edge" || evidence.stage === "read_only") &&
    (evidence.profile === "edge" ||
      evidence.profile === "service" ||
      evidence.profile === "live-user") &&
    (evidence.stage === "edge") === (evidence.profile === "edge") &&
    typeof evidence.category === "string" &&
    acceptanceFailureCategories.has(evidence.category) &&
    typeof evidence.lastCompletedBoundary === "string" &&
    /^[A-Za-z0-9_:-]{1,64}$/u.test(evidence.lastCompletedBoundary) &&
    (evidence.failureCode === undefined ||
      (typeof evidence.failureCode === "string" &&
        /^[a-z0-9_]{1,64}$/u.test(evidence.failureCode))) &&
    Array.isArray(evidence.correlationIds) &&
    evidence.correlationIds.length <= 16 &&
    evidence.correlationIds.every(
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id),
    ),
  );
};

export function parseCurrentDeployment(raw: string): CurrentDeployment {
  const parsed = json(raw, "cloudflare_deployments_invalid");
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new DeployFailure("cloudflare_deployments_missing");
  }
  const latest = [...parsed]
    .map(object)
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .sort((left, right) =>
      String(left.created_on ?? "").localeCompare(
        String(right.created_on ?? ""),
      ),
    )
    .at(-1);
  if (!latest) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  const id = latest.id;
  const versions = latest.versions;
  if (
    typeof id !== "string" ||
    !Array.isArray(versions) ||
    versions.length !== 1
  ) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  const deployed = object(versions[0]);
  const deployedId = deployed?.version_id;
  if (
    typeof deployedId !== "string" ||
    !versionId.test(deployedId) ||
    deployed?.percentage !== 100
  ) {
    throw new DeployFailure("cloudflare_deployment_ambiguous");
  }
  return { id, version: deployedId };
}

const configPlainNames = [
  "MCP_AUTH_TIMEOUT_MS",
  "MCP_CONTROL_TIMEOUT_MS",
  "MCP_TOTAL_TIMEOUT_MS",
  "MCP_BACKEND_TIMEOUT_MS",
  "MCP_CREDENTIAL_ONBOARDING_ENABLED",
  "NEMLIG_MCP_ONBOARDING_CLIENT_ID",
  "NEMLIG_MCP_CREDENTIAL_KEY_VERSION",
  "NEMLIG_MCP_HTTP_HOST",
  "NEMLIG_MCP_HTTP_PORT",
  "NEMLIG_MCP_AUTH0_ISSUER",
  "NEMLIG_MCP_AUTH0_AUDIENCE",
  "NEMLIG_MCP_PUBLIC_URL",
  "NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED",
  "NEMLIG_MCP_SERVICE_CLIENT_ID",
] as const;
const configPlainSet = new Set<string>(configPlainNames);
const requiredSecrets = new Set(["NEMLIG_MCP_PRINCIPALS"]);
const expectedDo = new Map([
  ["NEMLIG_MCP_CONTAINER", "NemligMcpContainer"],
  ["NEMLIG_LOCAL_BASKET_STORAGE", "OwnerLocalBasketStorage"],
]);
const planStorageExpectedDo = new Map([
  ["NEMLIG_MCP_CONTAINER", "NemligMcpContainer"],
  ["NEMLIG_PLAN_STORAGE", "PlanStorage"],
]);
const productionWorker = "nemlig-mcp-cloudflare-production";

const bindings = (
  resource: Record<string, unknown>,
): Map<string, Record<string, unknown>> => {
  const resources = object(resource.resources);
  const values = resources?.bindings;
  if (!Array.isArray(values)) {
    throw new DeployFailure("cloudflare_version_bindings_invalid");
  }
  const result = new Map<string, Record<string, unknown>>();
  for (const entry of values) {
    const value = object(entry) ?? fail("cloudflare_version_bindings_invalid");
    const name =
      typeof value.name === "string"
        ? value.name
        : fail("cloudflare_version_bindings_invalid");
    if (
      name.length === 0 ||
      typeof value.type !== "string" ||
      result.has(name)
    ) {
      fail("cloudflare_version_bindings_invalid");
    }
    result.set(name, value);
  }
  return result;
};

const validateDo = (
  bindings: Iterable<Record<string, unknown>>,
  expected = [expectedDo],
): ReadonlyMap<string, string> => {
  const found = new Map<string, string>();
  for (const value of bindings) {
    if (value.type !== "durable_object_namespace") {
      continue;
    }
    const name =
      typeof value.name === "string"
        ? value.name
        : fail("cloudflare_runtime_safety_mismatch");
    const className =
      typeof value.class_name === "string"
        ? value.class_name
        : fail("cloudflare_runtime_safety_mismatch");
    if (
      found.has(name) ||
      (value.script_name !== undefined &&
        value.script_name !== null &&
        value.script_name !== productionWorker) ||
      (value.environment !== undefined &&
        value.environment !== null &&
        value.environment !== "production") ||
      (value.environment !== undefined &&
        value.environment !== null &&
        value.script_name == null)
    ) {
      fail("cloudflare_runtime_safety_mismatch");
    }
    found.set(name, className);
  }
  const matchingExpected = expected.find(
    (candidate) =>
      found.size === candidate.size &&
      [...candidate].every(
        ([name, className]) => found.get(name) === className,
      ),
  );
  if (!matchingExpected) {
    throw new DeployFailure("cloudflare_runtime_safety_mismatch");
  }
  return matchingExpected;
};

const effectiveConfig = (
  vars: Map<string, string>,
  secrets: Iterable<string>,
  requireSecrets = true,
  durableObjects: ReadonlyMap<string, string> = expectedDo,
): EffectiveConfig => {
  const normalized = new Map(vars);
  if (!normalized.has("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED")) {
    normalized.set("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED", "false");
  }
  if (!normalized.has("NEMLIG_MCP_SERVICE_CLIENT_ID")) {
    normalized.set("NEMLIG_MCP_SERVICE_CLIENT_ID", "");
  }
  const serviceEnabled = normalized.get(
    "NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED",
  );
  const serviceClientId = normalized.get("NEMLIG_MCP_SERVICE_CLIENT_ID") ?? "";
  if (
    configPlainNames
      .filter(
        (name) =>
          name !== "NEMLIG_MCP_SERVICE_CLIENT_ID" &&
          name !== "NEMLIG_MCP_ONBOARDING_CLIENT_ID",
      )
      .some((name) => {
        const value = normalized.get(name);
        return (
          typeof value !== "string" || value.length === 0 || value.length > 2048
        );
      }) ||
    serviceClientId.length > 2048
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  if (
    !["true", "false"].includes(
      normalized.get("MCP_CREDENTIAL_ONBOARDING_ENABLED") ?? "",
    )
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  const browserClientId =
    normalized.get("NEMLIG_MCP_ONBOARDING_CLIENT_ID") ?? "";
  const onboardingEnabled =
    normalized.get("MCP_CREDENTIAL_ONBOARDING_ENABLED") === "true";
  if (
    (browserClientId !== "" || onboardingEnabled) &&
    !/^[A-Za-z0-9_-]{8,128}$/u.test(browserClientId)
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  if (
    !["true", "false"].includes(serviceEnabled ?? "") ||
    (serviceEnabled === "true" &&
      !/^[A-Za-z0-9_-]{1,128}$/u.test(serviceClientId))
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  if (
    !/^[A-Za-z0-9._-]{1,32}$/u.test(
      normalized.get("NEMLIG_MCP_CREDENTIAL_KEY_VERSION") ?? "",
    )
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  for (const name of [
    "MCP_AUTH_TIMEOUT_MS",
    "MCP_CONTROL_TIMEOUT_MS",
    "MCP_TOTAL_TIMEOUT_MS",
    "MCP_BACKEND_TIMEOUT_MS",
  ]) {
    const value = vars.get(name) ?? "";
    if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
      fail("cloudflare_runtime_safety_mismatch");
    }
  }
  try {
    const host = normalized.get("NEMLIG_MCP_HTTP_HOST") ?? "";
    const portText = normalized.get("NEMLIG_MCP_HTTP_PORT") ?? "";
    const port = Number(portText);
    if (
      !/^[\w.-]+$/u.test(host) ||
      !/^[1-9]\d*$/u.test(portText) ||
      !Number.isSafeInteger(port) ||
      port > 65535
    ) {
      throw new Error();
    }
    for (const name of [
      "NEMLIG_MCP_AUTH0_ISSUER",
      "NEMLIG_MCP_AUTH0_AUDIENCE",
      "NEMLIG_MCP_PUBLIC_URL",
    ]) {
      const url = new URL(normalized.get(name) ?? "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new Error();
      }
    }
  } catch {
    fail("cloudflare_runtime_safety_mismatch");
  }
  const secretNames = [...secrets].sort();
  if (
    secretNames.some(
      (name, index) =>
        (index > 0 && name === secretNames[index - 1]) ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(name),
    ) ||
    (requireSecrets &&
      ([...requiredSecrets].some((name) => !secretNames.includes(name)) ||
        (onboardingEnabled &&
          [
            "NEMLIG_MCP_ONBOARDING_SESSION_KEY",
            "NEMLIG_MCP_CREDENTIAL_KEY",
          ].some((name) => !secretNames.includes(name)))))
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  const canonical = JSON.stringify({
    limits: [100, 8],
    vars: [...normalized]
      .filter(([name]) => configPlainSet.has(name))
      .sort(([left], [right]) => left.localeCompare(right)),
    durableObjects: [...durableObjects].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    secrets: secretNames.map((name) => [name, "secret_text"]),
  });
  return {
    vars,
    secrets: secretNames,
    durableObjects,
    digest: createHash("sha256").update(canonical).digest("hex"),
  };
};

const versionConfig = (
  raw: string,
  expected = [expectedDo],
): EffectiveConfig => {
  const parsed =
    object(json(raw, "cloudflare_version_invalid")) ??
    fail("cloudflare_version_invalid");
  const resources = object(parsed.resources);
  const runtime = object(resources?.script_runtime);
  const limits = object(runtime?.limits);
  if (limits?.cpu_ms !== 100 || limits.subrequests !== 8) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  const values = bindings(parsed);
  const durableObjects = validateDo(values.values(), expected);
  const vars = new Map<string, string>();
  const secrets: string[] = [];
  for (const [name, value] of values) {
    if (
      configPlainSet.has(name) ||
      name === "MCP_ENABLED" ||
      name === "NEMLIG_MCP_REVISION"
    ) {
      if (value.type !== "plain_text") {
        fail("cloudflare_runtime_safety_mismatch");
      }
      const text =
        typeof value.text === "string"
          ? value.text
          : fail("cloudflare_runtime_safety_mismatch");
      vars.set(name, text);
    } else if (value.type === "secret_text") {
      secrets.push(name);
    } else if (value.type !== "durable_object_namespace") {
      fail("cloudflare_runtime_unexpected_binding");
    }
  }
  return effectiveConfig(vars, secrets, true, durableObjects);
};

export function parseVersionState(
  raw: string,
  expectedId?: string,
): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) {
    throw new DeployFailure("cloudflare_version_mismatch");
  }
  const id = parsed.id;
  if (
    typeof id !== "string" ||
    !versionId.test(id) ||
    (expectedId && id !== expectedId)
  ) {
    throw new DeployFailure("cloudflare_version_mismatch");
  }
  const values = bindings(parsed);
  const enabled = values.get("MCP_ENABLED")?.text;
  const revision = values.get("NEMLIG_MCP_REVISION")?.text;
  if (
    (enabled !== "true" && enabled !== "false") ||
    typeof revision !== "string" ||
    !revisionSha.test(revision)
  ) {
    throw new DeployFailure("cloudflare_version_state_invalid");
  }
  return { id, enabled: enabled === "true", revision };
}

export function verifyCandidateVersion(
  raw: string,
  expectedId: string,
  commit: string,
  enabled: boolean,
  expected = [expectedDo],
): VersionState {
  const parsed = object(json(raw, "cloudflare_version_invalid"));
  if (!parsed) {
    throw new DeployFailure("cloudflare_version_invalid");
  }
  const state = parseVersionState(raw, expectedId);
  if (state.revision !== commit || state.enabled !== enabled) {
    fail("cloudflare_candidate_state_mismatch");
  }
  const resources = object(parsed.resources);
  const runtime = object(resources?.script_runtime);
  const limits = object(runtime?.limits);
  const containers = runtime?.containers;
  if (
    limits?.cpu_ms !== 100 ||
    limits.subrequests !== 8 ||
    !Array.isArray(containers) ||
    containers.length !== 1 ||
    object(containers[0])?.class_name !== "NemligMcpContainer"
  ) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  const values = bindings(parsed);
  const expectedText: Record<string, string> = {
    MCP_AUTH_TIMEOUT_MS: "5000",
    MCP_BACKEND_TIMEOUT_MS: "85000",
    MCP_CONTROL_TIMEOUT_MS: "3000",
    MCP_TOTAL_TIMEOUT_MS: "90000",
  };
  for (const [name, text] of Object.entries(expectedText)) {
    if (values.get(name)?.text !== text) {
      fail("cloudflare_runtime_safety_mismatch");
    }
  }
  validateDo(values.values(), expected);
  if (!values.has("NEMLIG_MCP_PRINCIPALS")) {
    fail("cloudflare_runtime_safety_mismatch");
  }
  return state;
}

const verifyConfig = (raw: string, expected: EffectiveConfig): void => {
  if (versionConfig(raw).digest !== expected.digest) {
    fail("cloudflare_runtime_safety_mismatch");
  }
};

export function parseContainer(raw: string): ContainerState {
  const parsed = json(raw, "cloudflare_containers_invalid");
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new DeployFailure("cloudflare_container_ambiguous");
  }
  const value = object(parsed[0]);
  if (!value) {
    throw new DeployFailure("cloudflare_container_ambiguous");
  }
  const id = value.id;
  const image = value.image;
  const digest =
    typeof image === "string"
      ? image.match(/(?:^|@)(sha256:[0-9a-f]{64})$/u)?.[1]
      : undefined;
  const version = value.version;
  if (
    typeof id !== "string" ||
    !versionId.test(id) ||
    !digest ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    value.name !== containerApplication ||
    value.instances !== 1
  ) {
    throw new DeployFailure("cloudflare_container_ambiguous");
  }
  return { id, image: digest, version };
}

export function instancesInactive(raw: string): boolean {
  const parsed = json(raw, "cloudflare_instances_invalid");
  const instance =
    Array.isArray(parsed) && parsed.length === 1
      ? object(parsed[0])
      : undefined;
  return (
    instance?.state === "inactive" &&
    typeof instance.id === "string" &&
    instance.id.length > 0 &&
    instance.name === "nemlig-production" &&
    instance.version === null
  );
}

const deployedVersionFromOutput = (raw: string): string => {
  const id = raw.match(/Current Version ID:\s*([0-9a-f-]{36})/u)?.[1];
  return id && versionId.test(id)
    ? id
    : fail("cloudflare_upload_version_missing");
};

const manifestDigest = (raw: string): string => {
  const descriptor = object(
    object(json(raw, "cloudflare_registry_manifest_invalid"))?.Descriptor,
  );
  const digest = descriptor?.digest;
  return typeof digest === "string" && imageDigest.test(digest)
    ? digest
    : fail("cloudflare_registry_manifest_invalid");
};

export const defaultRunner: CommandRunner = async (
  command,
  args,
  options = {},
) =>
  await new Promise<string>((resolvePromise, reject) => {
    if (options.signal?.aborted) {
      reject(new DeployFailure("command_cancelled"));
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000,
    );
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
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
      if (finished) {
        return;
      }
      finished = true;
      clean();
      if (error) {
        reject(error);
      } else {
        resolvePromise(output.trim());
      }
    };
    const terminate = () => {
      if (terminated) {
        return;
      }
      terminated = true;
      try {
        process.kill(
          process.platform === "win32" ? child.pid! : -child.pid!,
          "SIGTERM",
        );
      } catch {
        /* already closed */
      }
      terminatedGroup = new Promise((resolvePromise) =>
        setTimeout(() => {
          try {
            process.kill(
              process.platform === "win32" ? child.pid! : -child.pid!,
              "SIGKILL",
            );
          } catch {
            /* already closed */
          }
          resolvePromise();
        }, 5_000),
      );
    };
    controller.signal.addEventListener("abort", terminate, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length + chunk.length > 16 * 1024 * 1024) {
        overflow = true;
        controller.abort();
      } else {
        output += chunk.toString();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-64 * 1024);
    });
    child.on("error", () => done(new CommandFailure("command_failed")));
    child.on("close", (code) => {
      if (controller.signal.aborted) {
        void (terminatedGroup ?? Promise.resolve()).then(() =>
          done(
            new DeployFailure(
              overflow ? "command_failed" : "command_cancelled",
            ),
          ),
        );
      } else if (code === 0) {
        done();
      } else {
        done(
          new CommandFailure(
            "command_failed",
            /HTTP 404\b/u.test(stderr) ? 404 : undefined,
            options.captureFailureStdout?.(output.slice(-16 * 1024).trim()),
            commandFailureDiagnostic(stderr),
          ),
        );
      }
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });

const runAt = (
  deps: DeployDependencies,
  cwd: string,
  command: string,
  args: readonly string[],
  options: RunOptions = {},
) => {
  const signal = options.signal ?? deps.signal;
  signal?.throwIfAborted();
  return deps.run(command, args, {
    ...options,
    signal,
    cwd,
    env: { ...deps.env, ...options.env },
  });
};

const wrangler = (
  deps: DeployDependencies,
  args: readonly string[],
  timeoutMs = 30_000,
) =>
  runAt(
    deps,
    deps.packageRoot,
    "pnpm",
    ["exec", "wrangler", ...args, "--env", "production"],
    { timeoutMs },
  );

const readCurrent = async (
  deps: DeployDependencies,
): Promise<CurrentDeployment> =>
  parseCurrentDeployment(
    await wrangler(deps, ["deployments", "list", "--json"]),
  );

const readVersion = async (
  deps: DeployDependencies,
  id: string,
): Promise<string> => await wrangler(deps, ["versions", "view", id, "--json"]);

const readContainer = async (
  deps: DeployDependencies,
  applicationId?: string,
): Promise<ContainerState> => {
  const id =
    applicationId ??
    parseContainer(await wrangler(deps, ["containers", "list", "--json"])).id;
  const info = object(
    json(
      await wrangler(deps, ["containers", "info", id, "--json"]),
      "cloudflare_containers_invalid",
    ),
  );
  const configuration = object(info?.configuration);
  return parseContainer(
    JSON.stringify([
      {
        id: info?.id,
        name: info?.name,
        instances: info?.instances,
        image: configuration?.image,
        version: info?.version,
      },
    ]),
  );
};

interface ContainerApplicationReadback {
  image: string;
  version: number;
  schedulingPolicy: string;
  activeRolloutId?: string;
}

const readContainerApplication = async (
  deps: DeployDependencies,
  applicationId: string,
): Promise<ContainerApplicationReadback> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  const token = deps.env.CLOUDFLARE_API_TOKEN;
  if (!account || !/^[0-9a-f]{32}$/u.test(account) || !token) {
    fail("cloudflare_container_read_unavailable");
  }
  let response: Response;
  try {
    response = await deps.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${account}/containers/applications/${applicationId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: deps.signal,
      },
    );
  } catch {
    return fail("cloudflare_container_read_failed");
  }
  let envelope: unknown;
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) {
      return fail("cloudflare_container_read_failed");
    }
    envelope = JSON.parse(raw) as unknown;
  } catch {
    return fail("cloudflare_container_read_failed");
  }
  const result = object(object(envelope)?.result);
  const configuration = object(result?.configuration);
  const image = configuration?.image;
  const version = result?.version;
  const schedulingPolicy = result?.scheduling_policy;
  const activeRolloutId = result?.active_rollout_id;
  if (
    !response.ok ||
    object(envelope)?.success !== true ||
    result?.id !== applicationId ||
    typeof image !== "string" ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    (activeRolloutId !== undefined &&
      activeRolloutId !== null &&
      typeof activeRolloutId !== "string")
  ) {
    return fail("cloudflare_container_read_failed");
  }
  if (schedulingPolicy !== "default") {
    return fail("cloudflare_container_read_unavailable");
  }
  return {
    image,
    version,
    schedulingPolicy,
    ...(typeof activeRolloutId === "string" ? { activeRolloutId } : {}),
  };
};

const resolveCandidateImage = async (
  deps: DeployDependencies,
  workerVersion: string,
): Promise<string> => {
  const account = deps.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account || !/^[0-9a-f]{32}$/u.test(account)) {
    fail("cloudflare_registry_manifest_invalid");
  }
  const ref = `registry.cloudflare.com/${account}/${containerApplication}:${workerVersion.split("-")[0]}`;
  return manifestDigest(
    await runAt(
      deps,
      deps.packageRoot,
      "docker",
      ["manifest", "inspect", "-v", ref],
      { timeoutMs: 120_000 },
    ),
  );
};

const readLocalConfig = async (
  deps: DeployDependencies,
): Promise<EffectiveConfig> => {
  const trusted = await realpath(
    resolve(deps.packageRoot, "wrangler.jsonc"),
  ).catch(() => fail("cloudflare_config_invalid"));
  let config: unknown;
  try {
    const reader =
      deps.configReader ??
      (async ({ config: path, env }: { config: string; env: "production" }) => {
        const { unstable_readConfig } = await import("wrangler");
        return unstable_readConfig(
          { config: path, env },
          { hideWarnings: true },
        );
      });
    config = await reader({ config: trusted, env: "production" });
  } catch {
    fail("cloudflare_config_invalid");
  }
  const value = object(config) ?? fail("cloudflare_config_invalid");
  if (
    typeof value.configPath !== "string" ||
    typeof value.userConfigPath !== "string" ||
    (await realpath(value.configPath).catch(() => "")) !== trusted ||
    (await realpath(value.userConfigPath).catch(() => "")) !== trusted ||
    value.name !== productionWorker ||
    value.keep_vars !== false
  ) {
    fail("cloudflare_config_invalid");
  }
  const limits = object(value.limits);
  const containers = value.containers;
  if (
    limits?.cpu_ms !== 100 ||
    limits.subrequests !== 8 ||
    !Array.isArray(containers) ||
    containers.length !== 1
  ) {
    fail("cloudflare_config_invalid");
  }
  const container = object((containers as unknown[])[0]);
  if (
    !container ||
    container.class_name !== "NemligMcpContainer" ||
    container.instance_type !== "lite" ||
    container.max_instances !== 1 ||
    object(container.constraints)?.jurisdiction !== "eu"
  ) {
    fail("cloudflare_config_invalid");
  }
  const rawVars = object(value.vars) ?? fail("cloudflare_config_invalid");
  if (
    Object.keys(rawVars).some(
      (name) => name !== "MCP_ENABLED" && !configPlainSet.has(name),
    )
  ) {
    fail("cloudflare_config_invalid");
  }
  const vars = new Map<string, string>();
  for (const [name, plain] of Object.entries(rawVars)) {
    vars.set(
      name,
      typeof plain === "string" ? plain : fail("cloudflare_config_invalid"),
    );
  }
  const durable = object(value.durable_objects);
  const durableBindings = durable?.bindings;
  if (!Array.isArray(durableBindings)) {
    fail("cloudflare_config_invalid");
  }
  validateDo(
    (durableBindings as unknown[]).map((entry) => {
      const binding = object(entry) ?? fail("cloudflare_config_invalid");
      return { ...binding, type: "durable_object_namespace" };
    }),
  );
  return effectiveConfig(vars, [], false);
};

const candidateConfig = (
  local: EffectiveConfig,
  live: EffectiveConfig,
): EffectiveConfig => {
  const vars = new Map(local.vars);
  const onboarding = live.vars.get("MCP_CREDENTIAL_ONBOARDING_ENABLED");
  if (onboarding !== "true" && onboarding !== "false") {
    fail("cloudflare_runtime_safety_mismatch");
  }
  vars.set("MCP_CREDENTIAL_ONBOARDING_ENABLED", onboarding as string);
  for (const name of [
    "NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED",
    "NEMLIG_MCP_SERVICE_CLIENT_ID",
    "NEMLIG_MCP_ONBOARDING_CLIENT_ID",
  ]) {
    const value = live.vars.get(name);
    if (value !== undefined) {
      vars.set(name, value);
    }
  }
  return effectiveConfig(vars, live.secrets);
};

const isPlanStorageRetirement = (
  live: EffectiveConfig,
  configured: EffectiveConfig,
): boolean =>
  live.durableObjects === planStorageExpectedDo &&
  configured.durableObjects === expectedDo &&
  effectiveConfig(live.vars, live.secrets).digest === configured.digest;

const deployVars = (
  config: EffectiveConfig,
  enabled: boolean,
  commit: string,
): string[] => [
  ...[...config.vars]
    .filter(([name]) => configPlainSet.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, value]) => ["--var", `${name}:${value}`]),
  "--var",
  `MCP_ENABLED:${enabled}`,
  "--var",
  `NEMLIG_MCP_REVISION:${commit}`,
];

const repoIdentity = async (
  deps: DeployDependencies,
): Promise<{ nameWithOwner: string; url: string }> => {
  const value = object(
    json(
      await runAt(deps, deps.repoRoot, "gh", [
        "repo",
        "view",
        "--json",
        "nameWithOwner,url",
      ]),
      "github_repository_invalid",
    ),
  );
  if (
    !value ||
    value.nameWithOwner !== productionRepository ||
    typeof value.url !== "string"
  ) {
    throw new DeployFailure("github_repository_invalid");
  }
  return { nameWithOwner: value.nameWithOwner, url: value.url };
};

const verifySource = async (
  deps: DeployDependencies,
  commit: string,
  repo: { nameWithOwner: string; url: string },
): Promise<number> => {
  await runAt(deps, deps.repoRoot, "gh", [
    "auth",
    "status",
    "-h",
    "github.com",
  ]);
  await runAt(deps, deps.repoRoot, "git", [
    "-c",
    "credential.helper=!gh auth git-credential",
    "fetch",
    repo.url,
    "main:refs/remotes/origin/main",
  ]);
  const [head, status] = await Promise.all([
    runAt(deps, deps.repoRoot, "git", ["rev-parse", "HEAD"]),
    runAt(deps, deps.repoRoot, "git", ["status", "--porcelain"]),
  ]);
  if (head !== commit || status !== "") {
    fail("source_revision_mismatch");
  }
  try {
    await runAt(deps, deps.repoRoot, "git", [
      "merge-base",
      "--is-ancestor",
      commit,
      "origin/main",
    ]);
  } catch {
    fail("source_revision_mismatch");
  }
  if (
    deps.env.GITHUB_EVENT_NAME === "workflow_run" &&
    (await runAt(deps, deps.repoRoot, "git", ["rev-parse", "origin/main"])) !==
      commit
  ) {
    fail("source_revision_mismatch");
  }
  const workflows = json(
    await runAt(deps, deps.repoRoot, "gh", [
      "workflow",
      "list",
      "--repo",
      repo.nameWithOwner,
      "--all",
      "--limit",
      "100",
      "--json",
      "id,name,path,state",
    ]),
    "github_ci_workflow_invalid",
  );
  const matchingWorkflows = Array.isArray(workflows)
    ? workflows
        .map(object)
        .filter(
          (workflow) =>
            workflow?.name === ciWorkflowName &&
            workflow.path === ciWorkflowPath &&
            workflow.state === "active",
        )
    : [];
  const workflowId =
    matchingWorkflows.length === 1 ? matchingWorkflows[0]?.id : undefined;
  if (typeof workflowId !== "number") {
    fail("github_ci_workflow_invalid");
  }
  const runs = json(
    await runAt(deps, deps.repoRoot, "gh", [
      "run",
      "list",
      "--repo",
      repo.nameWithOwner,
      "--commit",
      commit,
      "--workflow",
      String(workflowId),
      "--limit",
      "10",
      "--json",
      "conclusion,databaseId,event,headBranch,headSha,status,url,workflowDatabaseId,workflowName",
    ]),
    "github_ci_invalid",
  );
  const trusted = Array.isArray(runs)
    ? runs
        .map(object)
        .filter(
          (run) =>
            run?.headSha === commit &&
            run.event === "push" &&
            run.headBranch === "main" &&
            run.workflowName === ciWorkflowName &&
            run.workflowDatabaseId === workflowId &&
            typeof run.databaseId === "number",
        )
        .sort(
          (left, right) =>
            (right!.databaseId as number) - (left!.databaseId as number),
        )[0]
    : undefined;
  if (!trusted) {
    fail("exact_head_ci_not_green");
  }
  const trustedRun = trusted as Record<string, unknown>;
  if (
    trustedRun.status !== "completed" ||
    trustedRun.conclusion !== "success"
  ) {
    fail("exact_head_ci_not_green");
  }
  const run = object(
    json(
      await runAt(deps, deps.repoRoot, "gh", [
        "run",
        "view",
        String(trustedRun.databaseId),
        "--repo",
        repo.nameWithOwner,
        "--json",
        "jobs",
      ]),
      "github_ci_invalid",
    ),
  );
  const jobs = Array.isArray(run?.jobs)
    ? run.jobs
        .map(object)
        .filter((job): job is Record<string, unknown> => Boolean(job))
    : [];
  const verify = jobs.filter((job) => job.name === "verify");
  if (
    verify.length !== 1 ||
    verify[0]?.status !== "completed" ||
    verify[0]?.conclusion !== "success"
  ) {
    fail("exact_head_ci_not_green");
  }
  return trustedRun.databaseId as number;
};

const verifyAutomaticCandidateIsCurrentMain = async (
  deps: DeployDependencies,
  commit: string,
  repo: { url: string },
): Promise<void> => {
  if (deps.env.GITHUB_EVENT_NAME !== "workflow_run") {
    return;
  }
  await runAt(deps, deps.repoRoot, "git", [
    "-c",
    "credential.helper=!gh auth git-credential",
    "fetch",
    repo.url,
    "main:refs/remotes/origin/main",
  ]);
  try {
    await runAt(deps, deps.repoRoot, "git", [
      "merge-base",
      "--is-ancestor",
      commit,
      "origin/main",
    ]);
  } catch {
    fail("source_revision_mismatch");
  }
  if (
    (await runAt(deps, deps.repoRoot, "git", ["rev-parse", "origin/main"])) !==
    commit
  ) {
    fail("source_revision_mismatch");
  }
};

const githubEnvironment = async (
  deps: DeployDependencies,
  repository: string,
  path: string,
): Promise<Record<string, unknown>> => {
  try {
    const value = json(
      await runAt(deps, deps.repoRoot, "gh", [
        "api",
        `repos/${repository}/${path}`,
      ]),
      "github_environment_not_ready",
    );
    return object(value) ?? fail("github_environment_not_ready");
  } catch {
    return fail("github_environment_not_ready");
  }
};

const verifyGithubEnvironment = async (
  deps: DeployDependencies,
  repository: string,
): Promise<void> => {
  const environment = await githubEnvironment(
    deps,
    repository,
    "environments/nemlig-production",
  );
  const rules = Array.isArray(environment.protection_rules)
    ? environment.protection_rules.map(object)
    : [];
  const branchPolicy = object(environment.deployment_branch_policy);
  if (
    environment.can_admins_bypass !== false ||
    rules.length !== 1 ||
    rules[0]?.type !== "branch_policy" ||
    branchPolicy?.protected_branches !== false ||
    branchPolicy.custom_branch_policies !== true
  ) {
    fail("github_environment_not_ready");
  }
  const branches = await githubEnvironment(
    deps,
    repository,
    "environments/nemlig-production/deployment-branch-policies",
  );
  const policies = Array.isArray(branches.branch_policies)
    ? branches.branch_policies.map(object)
    : [];
  if (
    policies.length !== 1 ||
    policies[0]?.name !== "main" ||
    policies[0]?.type !== "branch"
  ) {
    fail("github_environment_not_ready");
  }
};

export type ProductionPreflight = {
  state: "ready";
  commit: string;
  ciRunId: number;
};
export async function preflightProductionDeploy(
  commit: string,
  deps: DeployDependencies,
): Promise<ProductionPreflight> {
  if (!fullSha.test(commit)) {
    fail("invalid_commit");
  }
  const repo = await repoIdentity(deps);
  const ciRunId = await verifySource(deps, commit, repo);
  await verifyGithubEnvironment(deps, repo.nameWithOwner);
  return { state: "ready", commit, ciRunId };
}

const sleepAbortably = async (
  deps: DeployDependencies,
  durationMs = 5_000,
): Promise<void> => {
  if (!deps.signal) {
    return await deps.sleep(durationMs);
  }
  await new Promise<void>((resolvePromise, reject) => {
    const abort = () => reject(new DeployFailure("command_cancelled"));
    deps.signal!.addEventListener("abort", abort, { once: true });
    void deps.sleep(durationMs).then(
      () => {
        deps.signal!.removeEventListener("abort", abort);
        resolvePromise();
      },
      (error) => {
        deps.signal!.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
};

const acceptanceCommandTimeoutMs = 120_000;
// Cloudflare activates the Worker before its Container rollout completes. The
// strict MCP initialization is the candidate-start proof, so reserve one
// bounded request for it rather than polling a post-request lifecycle state.
const serviceStartupEvidenceReserveMs = acceptanceCommandTimeoutMs;

const runningInstanceVersion = (
  raw: string,
  minimumVersion: number,
): number | null => {
  const parsed = json(raw, "cloudflare_instances_invalid");
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    fail("cloudflare_instances_invalid");
  }
  const instance =
    object((parsed as unknown[])[0]) ?? fail("cloudflare_instances_invalid");
  const { id, name, state, version } = instance;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    name !== "nemlig-production" ||
    typeof state !== "string" ||
    (version !== null &&
      (!Number.isSafeInteger(version) || (version as number) < 1))
  ) {
    fail("cloudflare_instances_invalid");
  }
  if (state === "running") {
    if (typeof version !== "number") {
      return fail("cloudflare_instances_invalid");
    }
    return version >= minimumVersion ? version : null;
  }
  if (["provisioning", "stopping", "stopped"].includes(state as string)) {
    return null;
  }
  return fail("cloudflare_instances_invalid");
};

/**
 * Before an MCP call can wake or query a Container, prove that a pre-existing
 * instance has finished the candidate rollout. An inactive application is
 * valid: the first authenticated call will start the candidate image.
 */
const waitForAcceptedInstance = async (
  deps: DeployDependencies,
  applicationId: string,
  expectedVersion: number,
): Promise<void> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    deps.signal?.throwIfAborted();
    const raw = await wrangler(deps, [
      "containers",
      "instances",
      applicationId,
      "--json",
    ]);
    if (instancesInactive(raw)) {
      return;
    }
    const version = runningInstanceVersion(raw, expectedVersion);
    if (version !== null) {
      if (version !== expectedVersion) {
        fail("cloudflare_deployment_drift");
      }
      return;
    }
    if (attempt < 35) {
      await sleepAbortably(deps);
    }
  }
  fail("container_instance_timeout");
};

const waitForCandidateContainer = async (
  deps: DeployDependencies,
  workerVersion: string,
  starting: ContainerState,
  image: string,
): Promise<ContainerState> => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    await verifyCurrent(deps, workerVersion);
    const current = await readContainer(deps, starting.id);
    if (current.id !== starting.id) {
      fail("cloudflare_deployment_drift");
    }
    if (current.image === image) {
      return current;
    }
    if (
      current.image !== starting.image ||
      current.version !== starting.version
    ) {
      fail("cloudflare_deployment_drift");
    }
    if (attempt < 35) {
      await sleepAbortably(deps);
    }
  }
  return fail("container_instance_timeout");
};

const parseAcceptanceFailure = (
  stdout: string | undefined,
  profile: AcceptanceFailureEvidence["profile"],
  stage: AcceptanceFailureEvidence["stage"],
): AcceptanceFailureEvidence | undefined => {
  if (!stdout) {
    return undefined;
  }
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    if (!line.startsWith("{")) {
      continue;
    }
    let value: Record<string, unknown> | undefined;
    try {
      value = object(JSON.parse(line));
    } catch {
      continue;
    }
    if (
      !value ||
      value.schema !== 1 ||
      value.profile !== profile ||
      typeof value.failureCategory !== "string" ||
      !acceptanceFailureCategories.has(value.failureCategory) ||
      !Array.isArray(value.failed) ||
      value.failed.length !== 1 ||
      !(
        value.failed[0] === value.failureCategory ||
        (value.failureCategory === "feature_failed" &&
          [
            "product_viewer_html_mismatch",
            "service_tool_inventory_mismatch",
            "service_resource_inventory_mismatch",
            "service_runtime_version_mismatch",
          ].includes(value.failed[0]))
      ) ||
      typeof value.lastCompletedBoundary !== "string" ||
      !/^[A-Za-z0-9_:-]{1,64}$/u.test(value.lastCompletedBoundary) ||
      !Array.isArray(value.correlationIds) ||
      value.correlationIds.length > 16 ||
      !value.correlationIds.every(
        (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id),
      )
    ) {
      continue;
    }
    const evidence: AcceptanceFailureEvidence = {
      stage,
      profile,
      category: value.failureCategory as AcceptanceFailureEvidence["category"],
      lastCompletedBoundary: value.lastCompletedBoundary,
      correlationIds: value.correlationIds as string[],
      failureCode: value.failed[0] as string,
    };
    if (!validAcceptanceFailure(evidence)) {
      return undefined;
    }
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
  failure:
    | "edge_acceptance_failed"
    | "service_fixture_acceptance_failed"
    | "authenticated_read_only_acceptance_failed",
  runtimeConvergenceMs?: number,
  staleRuntimeAttemptLimit = 180,
): Promise<void> => {
  let lastEvidence: AcceptanceFailureEvidence | undefined;
  let attemptsMade = 0;
  const convergenceDeadline =
    runtimeConvergenceMs === undefined
      ? undefined
      : deps.now().getTime() + runtimeConvergenceMs;
  const remainingMs = (): number =>
    convergenceDeadline === undefined
      ? Infinity
      : convergenceDeadline - deps.now().getTime();
  let staleRuntimeAttempts = 0;
  for (let attempt = 0; attempt < attempts;) {
    if (remainingMs() <= 0) {
      throw new AcceptanceFailure(failure, lastEvidence, attemptsMade);
    }
    try {
      attemptsMade += 1;
      await runAt(deps, deps.packageRoot, "pnpm", args, {
        timeoutMs: Math.min(acceptanceCommandTimeoutMs, remainingMs()),
        env,
        captureFailureStdout: (stdout) =>
          parseAcceptanceFailure(stdout, profile, stage),
      });
      if (remainingMs() <= 0) {
        throw new AcceptanceFailure(failure, lastEvidence, attemptsMade);
      }
      return;
    } catch (error) {
      if (error instanceof AcceptanceFailure) {
        throw error;
      }
      const evidence = object(error)?.acceptanceFailure;
      if (validAcceptanceFailure(evidence)) {
        lastEvidence = evidence;
      }
      deps.signal?.throwIfAborted();
      if (deps.signal?.aborted) {
        throw new DeployFailure("command_cancelled");
      }
      const staleRuntime =
        profile === "service" &&
        validAcceptanceFailure(evidence) &&
        evidence.category === "feature_failed" &&
        evidence.lastCompletedBoundary === "service_runtime_version_read";
      if (staleRuntime) {
        staleRuntimeAttempts += 1;
      } else {
        attempt += 1;
      }
      if (
        (staleRuntime &&
          (runtimeConvergenceMs === undefined ||
            staleRuntimeAttempts >= staleRuntimeAttemptLimit)) ||
        attempt >= attempts ||
        remainingMs() <= 0
      ) {
        throw new AcceptanceFailure(failure, lastEvidence, attemptsMade);
      }
      const delayMs = staleRuntime ? 15_000 : 5_000;
      if (remainingMs() <= delayMs) {
        throw new AcceptanceFailure(failure, lastEvidence, attemptsMade);
      }
      await sleepAbortably(deps, delayMs);
    }
  }
};

const verifyCurrent = async (
  deps: DeployDependencies,
  expected: string,
): Promise<void> => {
  if ((await readCurrent(deps)).version !== expected) {
    fail("cloudflare_deployment_drift");
  }
};

const previousViewerGeneration = async (
  deps: DeployDependencies,
  revision: string,
) => {
  let source = "";
  try {
    source = await runAt(deps, deps.repoRoot, "git", [
      "show",
      `${revision}:apps/nemlig-assistant/src/product-viewer-identity.ts`,
    ]);
  } catch {
    fail("viewer_predecessor_identity_unknown");
  }
  const identity =
    /^export const PRODUCT_VIEWER_RESOURCE_URI = "([^"]+)";/mu.exec(
      source,
    )?.[1];
  if (identity === "ui://nemlig/shell.html") {
    try {
      return await fetchViewerGeneration(deps.fetcher, deps.signal);
    } catch {
      fail("viewer_predecessor_assets_unavailable");
    }
  }
  if (
    identity &&
    /^ui:\/\/nemlig\/(?:draft-list|product-viewer(?:-v(?:1[0-6]|[1-9]))?)\.html$/u.test(
      identity,
    )
  ) {
    return undefined;
  }
  fail("viewer_predecessor_identity_unknown");
};

export async function deployProduction(
  commit: string,
  inputDeps: DeployDependencies,
): Promise<ProductionDeploymentReport> {
  if (!fullSha.test(commit)) {
    fail("invalid_commit");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (inputDeps.signal?.aborted) {
    abort();
  } else {
    inputDeps.signal?.addEventListener("abort", abort, { once: true });
  }
  const deadline = setTimeout(abort, 25 * 60_000);
  const service =
    inputDeps.env.GITHUB_ACTIONS === "true" ||
    inputDeps.acceptanceMode === "service";
  const env = service
    ? Object.fromEntries(
        Object.keys(inputDeps.env)
          .filter(
            (name) =>
              ![
                "NEMLIG_MCP_ACCESS_TOKEN",
                "NEMLIG_MCP_SERVICE_CLIENT_SECRET",
                "NEMLIG_MCP_SERVICE_ACCESS_TOKEN",
              ].includes(name),
          )
          .map((name) => [name, inputDeps.env[name]]),
      )
    : inputDeps.env;
  const deps: DeployDependencies = {
    ...inputDeps,
    env,
    signal: controller.signal,
  };
  const report: ProductionDeploymentReport = {
    commit,
    ciRunId: 0,
    checks: [],
    outcome: "failed",
  };
  try {
    deps.signal?.throwIfAborted();
    if (!service && !deps.env.NEMLIG_MCP_ACCESS_TOKEN?.trim()) {
      fail("owner_access_token_required");
    }
    const repo = await repoIdentity(deps);
    report.ciRunId = await verifySource(deps, commit, repo);
    await verifyGithubEnvironment(deps, repo.nameWithOwner);
    report.checks.push("source_and_auth_preflight");
    let serviceToken: string | undefined;
    if (service) {
      if (deps.env.NEMLIG_CI_ACCEPTANCE_READY !== "true") {
        fail("service_acceptance_not_ready");
      }
      try {
        serviceToken = await (deps.issueServiceToken ?? issueServiceToken)(
          inputDeps.env,
          { fetcher: inputDeps.fetcher, signal: deps.signal },
        );
      } catch {
        fail("service_token_unavailable");
      }
    }

    const starting = await readCurrent(deps);
    const startingRaw = await readVersion(deps, starting.version);
    const startingState = parseVersionState(startingRaw, starting.version);
    verifyCandidateVersion(
      startingRaw,
      startingState.id,
      startingState.revision,
      startingState.enabled,
      [expectedDo, planStorageExpectedDo],
    );
    try {
      await runAt(deps, deps.repoRoot, "git", [
        "merge-base",
        "--is-ancestor",
        startingState.revision,
        commit,
      ]);
    } catch {
      fail("candidate_does_not_supersede_runtime");
    }
    const liveConfig = versionConfig(startingRaw, [
      expectedDo,
      planStorageExpectedDo,
    ]);
    const configured = candidateConfig(await readLocalConfig(deps), liveConfig);
    if (
      configured.digest !== liveConfig.digest &&
      !isPlanStorageRetirement(liveConfig, configured)
    ) {
      fail("cloudflare_runtime_safety_mismatch");
    }
    if (service) {
      const clientId = inputDeps.env.NEMLIG_MCP_SERVICE_CLIENT_ID?.trim();
      if (
        !clientId ||
        configured.vars.get("NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED") !==
          "true" ||
        configured.vars.get("NEMLIG_MCP_SERVICE_CLIENT_ID") !== clientId
      ) {
        fail("service_acceptance_not_ready");
      }
    }
    const startingContainer = await readContainer(deps);
    report.startingVersion = starting.version;
    const cloudflareApplication = await readContainerApplication(
      deps,
      startingContainer.id,
    );
    const startingImage = `registry.cloudflare.com/${deps.env.CLOUDFLARE_ACCOUNT_ID}/${containerApplication}@${startingContainer.image}`;
    if (
      cloudflareApplication.image !== startingImage ||
      cloudflareApplication.version !== startingContainer.version ||
      cloudflareApplication.activeRolloutId
    ) {
      fail("cloudflare_deployment_drift");
    }
    report.checks.push("starting_runtime_verified");

    const previousViewer = await previousViewerGeneration(
      deps,
      startingState.revision,
    );
    const staticRoot = resolve(deps.packageRoot, "dist/ui-static");
    try {
      const candidateViewer = await readLocalViewerGeneration(staticRoot);
      await writeViewerGenerationFiles(
        staticRoot,
        candidateViewer,
        previousViewer ? [previousViewer] : [],
      );
    } catch {
      fail("viewer_candidate_assets_invalid");
    }
    if (previousViewer) {
      report.checks.push("previous_viewer_assets_captured");
    }

    await verifyCurrent(deps, starting.version);
    await verifyAutomaticCandidateIsCurrentMain(deps, commit, repo);
    const output = await wrangler(
      deps,
      [
        "deploy",
        ...deployVars(configured, true, commit),
        "--containers-rollout",
        "immediate",
        "--message",
        `Automated production release at ${commit.slice(0, 7)}`,
      ],
      600_000,
    );
    const enabledId = deployedVersionFromOutput(output);
    report.enabledVersion = enabledId;
    await verifyCurrent(deps, enabledId);
    const enabledRaw = await readVersion(deps, enabledId);
    verifyCandidateVersion(enabledRaw, enabledId, commit, true);
    verifyConfig(enabledRaw, configured);
    const candidateImage = await resolveCandidateImage(deps, enabledId);
    const enabledContainer = await waitForCandidateContainer(
      deps,
      enabledId,
      startingContainer,
      candidateImage,
    );
    report.checks.push(
      "candidate_version_verified",
      "container_rollout_verified",
    );

    await waitForAcceptedInstance(
      deps,
      enabledContainer.id,
      enabledContainer.version,
    );
    if (service) {
      const edgeBudgetMs = 60_000;
      await retryAcceptance(
        deps,
        ["production:probe", "--viewer-assets"],
        { NEMLIG_EXPECTED_REVISION: commit },
        12,
        "edge",
        "edge",
        "edge_acceptance_failed",
        edgeBudgetMs,
      );
      await retryAcceptance(
        deps,
        [
          "production:test:features",
          "--service",
          "--initialize-only",
          "--wake-only",
        ],
        {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken!,
          NEMLIG_EXPECTED_REVISION: commit,
        },
        12,
        "read_only",
        "service",
        "service_fixture_acceptance_failed",
        12 * 60_000 - serviceStartupEvidenceReserveMs,
      );
      await retryAcceptance(
        deps,
        ["production:test:features", "--service", "--initialize-only"],
        {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken!,
          NEMLIG_EXPECTED_REVISION: commit,
        },
        12,
        "read_only",
        "service",
        "service_fixture_acceptance_failed",
        12 * 60_000 - serviceStartupEvidenceReserveMs,
      );
      await retryAcceptance(
        deps,
        ["production:test:features", "--service"],
        {
          NEMLIG_MCP_SERVICE_ACCESS_TOKEN: serviceToken!,
          NEMLIG_EXPECTED_REVISION: commit,
        },
        12,
        "read_only",
        "service",
        "service_fixture_acceptance_failed",
        11 * 60_000,
      );
    } else {
      await retryAcceptance(
        deps,
        ["production:probe", "--viewer-assets"],
        { NEMLIG_EXPECTED_REVISION: commit },
        12,
        "edge",
        "edge",
        "edge_acceptance_failed",
      );
      await retryAcceptance(
        deps,
        ["production:test:features"],
        { NEMLIG_EXPECTED_REVISION: commit },
        1,
        "read_only",
        "live-user",
        "authenticated_read_only_acceptance_failed",
      );
    }
    if (previousViewer) {
      try {
        await verifyViewerAssets(previousViewer, deps.fetcher, deps.signal);
      } catch {
        fail("viewer_asset_acceptance_failed");
      }
      report.checks.push("previous_viewer_assets_verified");
    }
    await verifyCurrent(deps, enabledId);
    const provenContainer = await readContainer(deps, enabledContainer.id);
    if (
      provenContainer.id !== enabledContainer.id ||
      provenContainer.image !== candidateImage ||
      provenContainer.version !== enabledContainer.version
    ) {
      fail("cloudflare_deployment_drift");
    }
    report.checks.push(
      "edge_acceptance",
      "read_only_acceptance",
      "final_runtime_verified",
    );
    report.outcome = "success";
  } catch (error) {
    if (error instanceof CommandFailure && error.diagnostic) {
      console.error(error.diagnostic);
    }
    report.failure =
      error instanceof DeployFailure && deploymentFailureReasons.has(error.code)
        ? error.code
        : "unexpected_failure";
    if (error instanceof AcceptanceFailure) {
      if (error.evidence) {
        report.acceptanceFailure = error.evidence;
      }
      const failureCode = error.evidence?.failureCode ?? error.code;
      const boundary = error.evidence?.lastCompletedBoundary ?? "unknown";
      console.error(
        `acceptance_final_failure_code=${failureCode} attempts=${error.attempts} last_completed_boundary=${boundary}`,
      );
    } else {
      console.error(report.failure);
    }
  } finally {
    clearTimeout(deadline);
    inputDeps.signal?.removeEventListener("abort", abort);
  }
  return report;
}

async function main(): Promise<void> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(packageRoot, "../..");
  const values =
    process.argv.slice(2)[0] === "--"
      ? process.argv.slice(3)
      : process.argv.slice(2);
  if (values.length === 1 && (values[0] === "--help" || values[0] === "-h")) {
    console.log(`Usage: ${productionDeployUsage}`);
    return;
  }
  const service = values[0] === "--service";
  const commit = values[service ? 1 : 0];
  if (values.length !== (service ? 2 : 1) || !fullSha.test(commit ?? "")) {
    fail(`usage: ${productionDeployUsage}`);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const deps: DeployDependencies = {
    repoRoot,
    packageRoot,
    env: process.env,
    run: defaultRunner,
    fetcher: fetch,
    signal: controller.signal,
    sleep: async (milliseconds) =>
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, milliseconds),
      ),
    now: () => new Date(),
    acceptanceMode: service ? "service" : "owner",
  };
  const report = await deployProduction(commit!, deps);
  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome !== "success") {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  basename(process.argv[1]).replace(/\.ts$/u, ".js") === "production-deploy.js"
) {
  main().catch((error) => {
    console.error(
      error instanceof DeployFailure ? error.code : "production_deploy_failed",
    );
    process.exitCode = 1;
  });
}
