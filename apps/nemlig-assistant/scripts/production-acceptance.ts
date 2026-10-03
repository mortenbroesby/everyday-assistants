import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { NEMLIG_VERSION } from "../src/runtime.js";
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
  constructor() { super("Service runtime version does not match the candidate."); }
}

export interface AcceptanceEntryDependencies {
  fetcher: typeof fetch;
  connect(origin: URL, token: string, signal: AbortSignal): Promise<ConnectedAcceptanceClient>;
  totalTimeoutMs?: number;
}

const required = (env: Environment, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parseArgs = (argv: string[]): { edgeOnly: boolean; service: boolean; initializeOnly: boolean } => {
  let edgeOnly = false;
  let service = false;
  let initializeOnly = false;
  for (const argument of argv) {
    if (argument === "--edge-only") {
      if (edgeOnly) throw new Error("--edge-only must not be repeated");
      edgeOnly = true;
    } else if (argument === "--service") {
      if (service) throw new Error("--service must not be repeated");
      service = true;
    } else if (argument === "--initialize-only") {
      if (initializeOnly) throw new Error("--initialize-only must not be repeated");
      initializeOnly = true;
    } else {
      throw new Error(`Unknown acceptance argument: ${argument}`);
    }
  }
  if (edgeOnly && (service || initializeOnly)) throw new Error("--edge-only cannot be combined with service acceptance");
  if (initializeOnly && !service) throw new Error("--initialize-only requires --service");
  return { edgeOnly, service, initializeOnly };
};

const abortable = async <T>(label: string, work: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) {
    void work.catch(() => undefined);
    throw new Error(`Production acceptance deadline exceeded during ${label}`);
  }
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error(`Production acceptance deadline exceeded during ${label}`));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
};

const defaultConnect = async (origin: URL, token: string, signal: AbortSignal): Promise<ConnectedAcceptanceClient> => {
  const client = new Client({ name: "nemlig-production-acceptance", version: "1.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
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
      if (!quiet) throw error;
    }
  };
  const closeOnAbort = () => { void close(true).catch(() => undefined); };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    await abortable("Authenticated MCP connect", client.connect(transport), signal);
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
      callTool: async (request) => await client.callTool(request) as {
        isError?: boolean;
        structuredContent?: unknown;
      },
    },
    close: async () => await close(),
  };
};

const defaultDependencies: AcceptanceEntryDependencies = { fetcher: fetch, connect: defaultConnect };

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
  failureCategory?: "input_invalid" | "deadline_exceeded" | "edge_failed" | "authentication_failed" | "transport_failed" | "feature_failed" | "unknown_failure";
  correlationIds: string[];
}

type AcceptanceOutcome = Omit<AcceptanceReport, "schema" | "sourceSha" | "startedAt" | "completedAt" | "failed" | "failureCategory">;

const failureCategory = (error: unknown): NonNullable<AcceptanceReport["failureCategory"]> => {
  if (error instanceof ProductViewerHtmlMismatchError || error instanceof ServiceInventoryMismatchError
    || error instanceof ServiceRuntimeVersionMismatchError) return "feature_failed";
  const message = error instanceof Error ? error.message : "";
  if (/deadline exceeded|timed out/iu.test(message)) return "deadline_exceeded";
  if (/argument|valid URL|required|fixed production target/iu.test(message)) return "input_invalid";
  if (/edge|health|revision|OAuth|anonymous|Origin/iu.test(message)) return "edge_failed";
  if (/token|authentication|authorization/iu.test(message)) return "authentication_failed";
  if (/connect|transport|MCP/iu.test(message)) return "transport_failed";
  if (/feature|inventory|basket|favorites|shopping|resource/iu.test(message)) return "feature_failed";
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
  const timer = setTimeout(() => controller.abort(new Error("Production acceptance deadline exceeded")), dependencies.totalTimeoutMs ?? 90_000);
  try {
    let origin: URL;
    try {
      origin = new URL(env.NEMLIG_PRODUCTION_MCP_URL?.trim() || "https://nemlig-mcp.broesby.dk/mcp");
    } catch {
      throw new Error("NEMLIG_PRODUCTION_MCP_URL must be a valid URL");
    }
    if (env.CI?.trim() && origin.href !== "https://nemlig-mcp.broesby.dk/mcp") {
      throw new Error("CI acceptance requires the fixed production target");
    }
    const edge = options.initializeOnly ? undefined : await verifyProductionEdge(origin, dependencies.fetcher, {
      expectedRevision: env.NEMLIG_EXPECTED_REVISION?.trim() || undefined,
      signal: controller.signal,
      expectedScopes: ["use:nemlig-assistant"],
    });
    const observedRevision = edge && /^[0-9a-f]{40}$/u.test(edge.revision) ? edge.revision : undefined;
    if (progress && edge) progress.lastCompletedBoundary = edge.lastCompletedBoundary;
    if (options.edgeOnly) {
      return { profile: "edge", observedRevision, required: ["edge"], passed: ["edge"], unavailable: [], lastCompletedBoundary: edge!.lastCompletedBoundary, correlationIds: edge!.correlationIds };
    }

    const accessToken = required(env, options.service ? "NEMLIG_MCP_SERVICE_ACCESS_TOKEN" : "NEMLIG_MCP_ACCESS_TOKEN");
    const connected = await abortable("Authenticated MCP connect", dependencies.connect(origin, accessToken, controller.signal), controller.signal);
    if (progress) progress.lastCompletedBoundary = "authenticated_mcp_connect";
    const closeOnAbort = () => { void connected.close().catch(() => undefined); };
    controller.signal.addEventListener("abort", closeOnAbort, { once: true });
    let outcome: AcceptanceOutcome | undefined;
    let operationFailed = false;
    let operationError: unknown;
    try {
      if (options.service) {
        if (progress) progress.lastCompletedBoundary = "service_runtime_version_read";
        if (connected.serverVersion !== NEMLIG_VERSION) throw new ServiceRuntimeVersionMismatchError();
        if (options.initializeOnly) {
          outcome = { profile: "service", observedRevision, required: ["service_runtime"], passed: ["service_runtime"], unavailable: [], lastCompletedBoundary: "service_runtime_version_read", correlationIds: [] };
        } else {
          const report = await verifyServiceAcceptanceFeatures(connected.client, {
            signal: controller.signal,
            onBoundary: (boundary) => { if (progress) progress.lastCompletedBoundary = boundary; },
          });
          outcome = { profile: "service", observedRevision, required: ["edge", "service_fixture"], passed: ["edge", "service_fixture"], unavailable: [], lastCompletedBoundary: `service_fixture_${report.requestCount}_requests`, correlationIds: edge!.correlationIds };
        }
      } else {
        const report = await verifyReadOnlyProductionFeatures(connected.client, { signal: controller.signal });
        outcome = { profile: "live-user", observedRevision, required: ["edge", "live_user_features"], passed: ["edge", "live_user_features"], unavailable: report.unavailable, lastCompletedBoundary: "live_user_features", correlationIds: edge!.correlationIds };
      }
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    controller.signal.removeEventListener("abort", closeOnAbort);
    try {
      await abortable("Authenticated MCP close", connected.close(), controller.signal);
    } catch (error) {
      if (!operationFailed) { operationFailed = true; operationError = error; }
    }
    if (operationFailed) throw operationError;
    if (!outcome) throw new Error("Production acceptance outcome unavailable");
    return outcome;
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
  const sourceSha = /^[0-9a-f]{40}$/u.test(env.GITHUB_SHA?.trim() ?? "") ? env.GITHUB_SHA?.trim() : undefined;
  const progress = { lastCompletedBoundary: "none" };
  try {
    const outcome = await main(argv, env, dependencies, progress);
    const report: AcceptanceReport = { schema: 1, sourceSha, startedAt, completedAt: new Date().toISOString(), ...outcome, failed: [] };
    console.log(JSON.stringify(report));
    return report;
  } catch (error) {
    const boundedFailure = error instanceof ProductViewerHtmlMismatchError || error instanceof ServiceInventoryMismatchError
      || error instanceof ServiceRuntimeVersionMismatchError ? error : undefined;
    const report: AcceptanceReport = {
      schema: 1, sourceSha, startedAt, completedAt: new Date().toISOString(),
      profile: argv.includes("--edge-only") ? "edge" : argv.includes("--service") ? "service" : "live-user",
      required: [], passed: [],
      failed: [boundedFailure?.code ?? failureCategory(error)],
      unavailable: [],
      lastCompletedBoundary: boundedFailure?.lastCompletedBoundary ?? progress.lastCompletedBoundary,
      failureCategory: failureCategory(error), correlationIds: [],
    };
    console.log(JSON.stringify(report));
    return report;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((report) => { if (report.failed.length) process.exitCode = 1; });
}
