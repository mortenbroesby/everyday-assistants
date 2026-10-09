import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { NEMLIG_VERSION } from "../src/runtime.js";
import {
  fetchViewerGeneration,
  type ViewerGeneration,
} from "../src/viewer-assets.js";
import { readLocalViewerGeneration } from "./viewer-generation.js";
import {
  ProductViewerHtmlMismatchError,
  ServiceInventoryMismatchError,
  verifyProductionEdge,
  verifyReadOnlyProductionFeatures,
  verifyServiceAcceptanceFeatures,
  type AcceptanceClient,
} from "../src/production-acceptance.js";

type Environment = Record<string, string | undefined>;

interface ConnectedAcceptanceClient {
  client: AcceptanceClient;
  serverVersion?: string;
  close(): Promise<void>;
}

class ServiceRuntimeVersionMismatchError extends Error {
  readonly code = "service_runtime_version_mismatch";
  readonly lastCompletedBoundary = "service_runtime_version_read";
  constructor() {
    super("Service runtime version does not match the candidate.");
  }
}

class ViewerAssetMismatchError extends Error {
  readonly code = "viewer_assets_mismatch";
  readonly lastCompletedBoundary = "viewer_assets_read";
  constructor() {
    super("Public viewer assets do not match the candidate build.");
  }
}

export interface AcceptanceEntryDependencies {
  fetcher: typeof fetch;
  connect(
    origin: URL,
    token: string,
    signal: AbortSignal,
  ): Promise<ConnectedAcceptanceClient>;
  totalTimeoutMs?: number;
  expectedViewer?: () => Promise<ViewerGeneration>;
}

const required = (env: Environment, name: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const expectedServiceVersion = (env: Environment): string => {
  const configured = env.NEMLIG_EXPECTED_SERVICE_VERSION?.trim();
  if (!configured) {
    return NEMLIG_VERSION;
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(configured)) {
    throw new Error(
      "NEMLIG_EXPECTED_SERVICE_VERSION must be a package version",
    );
  }
  return configured;
};

const acceptanceFlags = new Set([
  "--edge-only",
  "--viewer-assets",
  "--service",
  "--initialize-only",
  "--wake-only",
]);

const readAcceptanceFlags = (argv: string[]): Set<string> => {
  const flags = new Set<string>();
  for (const argument of argv) {
    if (!acceptanceFlags.has(argument)) {
      throw new Error(`Unknown acceptance argument: ${argument}`);
    }
    if (flags.has(argument)) {
      throw new Error(`${argument} must not be repeated`);
    }
    flags.add(argument);
  }
  return flags;
};

const acceptanceFlagRules: readonly [
  (flags: ReadonlySet<string>) => boolean,
  string,
][] = [
  [
    (flags) =>
      flags.has("--edge-only") &&
      (flags.has("--service") || flags.has("--initialize-only")),
    "--edge-only cannot be combined with service acceptance",
  ],
  [
    (flags) => flags.has("--initialize-only") && !flags.has("--service"),
    "--initialize-only requires --service",
  ],
  [
    (flags) =>
      flags.has("--wake-only") &&
      (!flags.has("--service") || !flags.has("--initialize-only")),
    "--wake-only requires --service --initialize-only",
  ],
  [
    (flags) => flags.has("--viewer-assets") && !flags.has("--edge-only"),
    "--viewer-assets requires --edge-only",
  ],
];

const validateAcceptanceFlags = (flags: ReadonlySet<string>): void => {
  const invalidRule = acceptanceFlagRules.find(([isInvalid]) =>
    isInvalid(flags),
  );
  if (invalidRule) {
    throw new Error(invalidRule[1]);
  }
};

const parseArgs = (
  argv: string[],
): {
  edgeOnly: boolean;
  viewerAssets: boolean;
  service: boolean;
  initializeOnly: boolean;
  wakeOnly: boolean;
} => {
  const flags = readAcceptanceFlags(argv);
  validateAcceptanceFlags(flags);
  const edgeOnly = flags.has("--edge-only");
  const viewerAssets = flags.has("--viewer-assets");
  const service = flags.has("--service");
  const initializeOnly = flags.has("--initialize-only");
  const wakeOnly = flags.has("--wake-only");
  return { edgeOnly, viewerAssets, service, initializeOnly, wakeOnly };
};

const abortable = async <T>(
  label: string,
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) {
    void work.catch(() => undefined);
    throw new Error(`Production acceptance deadline exceeded during ${label}`);
  }
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        onAbort = () =>
          reject(
            new Error(
              `Production acceptance deadline exceeded during ${label}`,
            ),
          );
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
};

const defaultConnect = async (
  origin: URL,
  token: string,
  signal: AbortSignal,
): Promise<ConnectedAcceptanceClient> => {
  const client = new Client(
    { name: "nemlig-production-acceptance", version: "1.0.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    },
  );
  const transport = new StreamableHTTPClientTransport(origin, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const close = async (quiet = false): Promise<void> => {
    const pending = client.close();
    if (signal.aborted) {
      void pending.catch(() => undefined);
      return;
    }
    try {
      await abortable("Authenticated MCP close", pending, signal);
    } catch (error) {
      if (!quiet) {
        throw error;
      }
    }
  };
  const closeOnAbort = () => {
    void close(true).catch(() => undefined);
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    await abortable(
      "Authenticated MCP connect",
      client.connect(transport),
      signal,
    );
  } catch (error) {
    await close(true);
    throw error;
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
  }
  return {
    serverVersion: client.getServerVersion()?.version,
    client: {
      listTools: () => client.listTools(),
      listResources: () => client.listResources(),
      readResource: (request: { uri: string }) => client.readResource(request),
      callTool: async (request) =>
        (await client.callTool(request)) as {
          isError?: boolean;
          structuredContent?: unknown;
        },
    },
    close: async () => await close(),
  };
};

const defaultDependencies: AcceptanceEntryDependencies = {
  fetcher: fetch,
  connect: defaultConnect,
  expectedViewer: () =>
    readLocalViewerGeneration(
      fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
    ),
};

export interface AcceptanceReport {
  schema: 1;
  sourceSha?: string;
  observedRevision?: string;
  startedAt: string;
  completedAt: string;
  profile: "edge" | "live-user" | "service";
  required: string[];
  passed: string[];
  failed: string[];
  unavailable: string[];
  lastCompletedBoundary: string;
  failureCategory?:
    | "input_invalid"
    | "deadline_exceeded"
    | "edge_failed"
    | "authentication_failed"
    | "transport_failed"
    | "feature_failed"
    | "unknown_failure";
  correlationIds: string[];
}

type AcceptanceOutcome = Omit<
  AcceptanceReport,
  | "schema"
  | "sourceSha"
  | "startedAt"
  | "completedAt"
  | "failed"
  | "failureCategory"
>;

const verifyViewerAssetAcceptance = async (
  dependencies: AcceptanceEntryDependencies,
  signal: AbortSignal,
  observedRevision: string | undefined,
  correlationIds: string[],
  progress?: { lastCompletedBoundary: string },
): Promise<AcceptanceOutcome> => {
  const [expected, actual] = await Promise.all([
    dependencies.expectedViewer
      ? dependencies.expectedViewer()
      : readLocalViewerGeneration(
          fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
        ),
    fetchViewerGeneration(dependencies.fetcher, signal),
  ]);
  if (progress) {
    progress.lastCompletedBoundary = "viewer_assets_read";
  }
  if (JSON.stringify(actual.manifest) !== JSON.stringify(expected.manifest)) {
    throw new ViewerAssetMismatchError();
  }
  return {
    profile: "edge",
    observedRevision,
    required: ["edge", "viewer_assets"],
    passed: ["edge", "viewer_assets"],
    unavailable: [],
    lastCompletedBoundary: "viewer_assets_read",
    correlationIds,
  };
};

const verifyEdgeAcceptance = async (
  options: ReturnType<typeof parseArgs>,
  origin: URL,
  env: Environment,
  dependencies: AcceptanceEntryDependencies,
  signal: AbortSignal,
  progress?: { lastCompletedBoundary: string },
): Promise<{
  edge?: Awaited<ReturnType<typeof verifyProductionEdge>>;
  observedRevision?: string;
  outcome?: AcceptanceOutcome;
}> => {
  const edge = options.initializeOnly
    ? undefined
    : await verifyProductionEdge(origin, dependencies.fetcher, {
        expectedRevision: env.NEMLIG_EXPECTED_REVISION?.trim() || undefined,
        signal,
        expectedScopes: ["use:nemlig-assistant"],
      });
  const observedRevision =
    edge && /^[0-9a-f]{40}$/u.test(edge.revision) ? edge.revision : undefined;
  if (progress && edge) {
    progress.lastCompletedBoundary = edge.lastCompletedBoundary;
  }
  if (!options.edgeOnly) {
    return { edge, observedRevision };
  }
  if (options.viewerAssets) {
    return {
      edge,
      observedRevision,
      outcome: await verifyViewerAssetAcceptance(
        dependencies,
        signal,
        observedRevision,
        edge!.correlationIds,
        progress,
      ),
    };
  }
  return {
    edge,
    observedRevision,
    outcome: {
      profile: "edge",
      observedRevision,
      required: ["edge"],
      passed: ["edge"],
      unavailable: [],
      lastCompletedBoundary: edge!.lastCompletedBoundary,
      correlationIds: edge!.correlationIds,
    },
  };
};

const verifyServiceFeatures = async (
  options: ReturnType<typeof parseArgs>,
  connected: ConnectedAcceptanceClient,
  env: Environment,
  signal: AbortSignal,
  observedRevision: string | undefined,
  edge: Awaited<ReturnType<typeof verifyProductionEdge>> | undefined,
  progress?: { lastCompletedBoundary: string },
): Promise<AcceptanceOutcome> => {
  if (progress) {
    progress.lastCompletedBoundary = "service_runtime_version_read";
  }
  if (
    !options.wakeOnly &&
    connected.serverVersion !== expectedServiceVersion(env)
  ) {
    throw new ServiceRuntimeVersionMismatchError();
  }
  if (options.wakeOnly || options.initializeOnly) {
    const wake = options.wakeOnly;
    return {
      profile: "service",
      observedRevision,
      required: [wake ? "service_wake" : "service_runtime"],
      passed: [wake ? "service_wake" : "service_runtime"],
      unavailable: [],
      lastCompletedBoundary: "service_runtime_version_read",
      correlationIds: [],
    };
  }
  const report = await verifyServiceAcceptanceFeatures(connected.client, {
    signal,
    onBoundary: (boundary) => {
      if (progress) {
        progress.lastCompletedBoundary = boundary;
      }
    },
  });
  return {
    profile: "service",
    observedRevision,
    required: ["edge", "service_fixture"],
    passed: ["edge", "service_fixture"],
    unavailable: [],
    lastCompletedBoundary: `service_fixture_${report.requestCount}_requests`,
    correlationIds: edge!.correlationIds,
  };
};

const verifyLiveUserFeatures = async (
  connected: ConnectedAcceptanceClient,
  signal: AbortSignal,
  observedRevision: string | undefined,
  edge: Awaited<ReturnType<typeof verifyProductionEdge>> | undefined,
): Promise<AcceptanceOutcome> => {
  const report = await verifyReadOnlyProductionFeatures(connected.client, {
    signal,
  });
  return {
    profile: "live-user",
    observedRevision,
    required: ["edge", "live_user_features"],
    passed: ["edge", "live_user_features"],
    unavailable: report.unavailable,
    lastCompletedBoundary: "live_user_features",
    correlationIds: edge!.correlationIds,
  };
};

const verifyAuthenticatedAcceptance = async (
  options: ReturnType<typeof parseArgs>,
  origin: URL,
  env: Environment,
  dependencies: AcceptanceEntryDependencies,
  signal: AbortSignal,
  edge: Awaited<ReturnType<typeof verifyProductionEdge>> | undefined,
  observedRevision: string | undefined,
  progress?: { lastCompletedBoundary: string },
): Promise<AcceptanceOutcome> => {
  const accessToken = required(
    env,
    options.service
      ? "NEMLIG_MCP_SERVICE_ACCESS_TOKEN"
      : "NEMLIG_MCP_ACCESS_TOKEN",
  );
  const connected = await abortable(
    "Authenticated MCP connect",
    dependencies.connect(origin, accessToken, signal),
    signal,
  );
  if (progress) {
    progress.lastCompletedBoundary = "authenticated_mcp_connect";
  }
  const closeOnAbort = () => {
    void connected.close().catch(() => undefined);
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  let outcome: AcceptanceOutcome | undefined;
  let operationFailed = false;
  let operationError: unknown;
  try {
    outcome = options.service
      ? await verifyServiceFeatures(
          options,
          connected,
          env,
          signal,
          observedRevision,
          edge,
          progress,
        )
      : await verifyLiveUserFeatures(connected, signal, observedRevision, edge);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  signal.removeEventListener("abort", closeOnAbort);
  try {
    await abortable("Authenticated MCP close", connected.close(), signal);
  } catch (error) {
    if (!operationFailed) {
      operationFailed = true;
      operationError = error;
    }
  }
  if (operationFailed) {
    throw operationError;
  }
  if (!outcome) {
    throw new Error("Production acceptance outcome unavailable");
  }
  return outcome;
};

const failureCategory = (
  error: unknown,
): NonNullable<AcceptanceReport["failureCategory"]> => {
  if (
    error instanceof ProductViewerHtmlMismatchError ||
    error instanceof ServiceInventoryMismatchError ||
    error instanceof ServiceRuntimeVersionMismatchError ||
    error instanceof ViewerAssetMismatchError
  ) {
    return "feature_failed";
  }
  const message = error instanceof Error ? error.message : "";
  if (/deadline exceeded|timed out/iu.test(message)) {
    return "deadline_exceeded";
  }
  if (/argument|valid URL|required|fixed production target/iu.test(message)) {
    return "input_invalid";
  }
  if (/edge|health|revision|OAuth|anonymous|Origin/iu.test(message)) {
    return "edge_failed";
  }
  if (/token|authentication|authorization/iu.test(message)) {
    return "authentication_failed";
  }
  if (/connect|transport|MCP/iu.test(message)) {
    return "transport_failed";
  }
  if (/feature|inventory|basket|favorites|shopping|resource/iu.test(message)) {
    return "feature_failed";
  }
  return "unknown_failure";
};

/** Run credential-free edge or authenticated read-only acceptance. */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: Environment = process.env,
  dependencies: AcceptanceEntryDependencies = defaultDependencies,
  progress?: { lastCompletedBoundary: string },
): Promise<AcceptanceOutcome> {
  const options = parseArgs(argv);
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(new Error("Production acceptance deadline exceeded")),
    dependencies.totalTimeoutMs ?? 90_000,
  );
  try {
    let origin: URL;
    try {
      origin = new URL(
        env.NEMLIG_PRODUCTION_MCP_URL?.trim() ||
          "https://nemlig-mcp.broesby.dk/mcp",
      );
    } catch {
      throw new Error("NEMLIG_PRODUCTION_MCP_URL must be a valid URL");
    }
    if (env.CI?.trim() && origin.href !== "https://nemlig-mcp.broesby.dk/mcp") {
      throw new Error("CI acceptance requires the fixed production target");
    }
    const edgeResult = await verifyEdgeAcceptance(
      options,
      origin,
      env,
      dependencies,
      controller.signal,
      progress,
    );
    if (edgeResult.outcome) {
      return edgeResult.outcome;
    }
    const { edge, observedRevision } = edgeResult;

    return await verifyAuthenticatedAcceptance(
      options,
      origin,
      env,
      dependencies,
      controller.signal,
      edge,
      observedRevision,
      progress,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function run(
  argv: string[] = process.argv.slice(2),
  env: Environment = process.env,
  dependencies: AcceptanceEntryDependencies = defaultDependencies,
): Promise<AcceptanceReport> {
  const startedAt = new Date().toISOString();
  const sourceSha = /^[0-9a-f]{40}$/u.test(env.GITHUB_SHA?.trim() ?? "")
    ? env.GITHUB_SHA?.trim()
    : undefined;
  const progress = { lastCompletedBoundary: "none" };
  try {
    const outcome = await main(argv, env, dependencies, progress);
    const report: AcceptanceReport = {
      schema: 1,
      sourceSha,
      startedAt,
      completedAt: new Date().toISOString(),
      ...outcome,
      failed: [],
    };
    console.log(JSON.stringify(report));
    return report;
  } catch (error) {
    const boundedFailure =
      error instanceof ProductViewerHtmlMismatchError ||
      error instanceof ServiceInventoryMismatchError ||
      error instanceof ServiceRuntimeVersionMismatchError ||
      error instanceof ViewerAssetMismatchError
        ? error
        : undefined;
    const report: AcceptanceReport = {
      schema: 1,
      sourceSha,
      startedAt,
      completedAt: new Date().toISOString(),
      profile: argv.includes("--edge-only")
        ? "edge"
        : argv.includes("--service")
          ? "service"
          : "live-user",
      required: [],
      passed: [],
      failed: [boundedFailure?.code ?? failureCategory(error)],
      unavailable: [],
      lastCompletedBoundary:
        boundedFailure?.lastCompletedBoundary ?? progress.lastCompletedBoundary,
      failureCategory: failureCategory(error),
      correlationIds: [],
    };
    console.log(JSON.stringify(report));
    return report;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run().then((report) => {
    if (report.failed.length) {
      process.exitCode = 1;
    }
  });
}
