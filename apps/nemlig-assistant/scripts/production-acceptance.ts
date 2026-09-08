import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  verifyApprovedReversibleProductionMutation,
  verifyAggregateTierUsage,
  verifyProductionEdge,
  verifyReadOnlyProductionFeatures,
  type AcceptanceClient,
  type ApprovedProductionMutation,
} from "../src/production-acceptance.js";

type Environment = Record<string, string | undefined>;

interface ConnectedAcceptanceClient {
  client: AcceptanceClient;
  close(): Promise<void>;
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

const record = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be a JSON object`);
  return value as Record<string, unknown>;
};

const approvedMutation = (env: Environment, name: string): ApprovedProductionMutation => {
  const serialized = required(env, name);
  if (required(env, `${name}_CONFIRMATION`) !== serialized) throw new Error(`${name}_CONFIRMATION must exactly repeat the approved envelope`);
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error(`${name} must contain valid JSON`);
  }
  const object = record(value, name);
  if (!["additions", "removal", "replacement", "clear"].includes(object.operation as string)) throw new Error(`${name} operation is invalid`);
  record(object.prepareArguments, `${name}.prepareArguments`);
  record(object.expectedReview, `${name}.expectedReview`);
  return object as unknown as ApprovedProductionMutation;
};

const parseArgs = (argv: string[]): { edgeOnly: boolean; mutation: boolean } => {
  let edgeOnly = false;
  let mutation = false;
  for (const argument of argv) {
    if (argument === "--edge-only") {
      if (edgeOnly) throw new Error("--edge-only must not be repeated");
      edgeOnly = true;
    } else if (argument === "--mutation") {
      if (mutation) throw new Error("--mutation must not be repeated");
      mutation = true;
    } else {
      throw new Error(`Unknown acceptance argument: ${argument}`);
    }
  }
  if (edgeOnly && mutation) throw new Error("--edge-only and --mutation cannot be combined");
  return { edgeOnly, mutation };
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
  const client = new Client({ name: "nemlig-production-acceptance", version: "1.0.0" });
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
  profile: "edge" | "live-user" | "mutation";
  required: string[];
  passed: string[];
  failed: string[];
  unavailable: string[];
  lastCompletedBoundary: string;
  failureCategory?: "input_invalid" | "deadline_exceeded" | "edge_failed" | "authentication_failed" | "transport_failed" | "feature_failed" | "owner_admin_failed" | "mutation_failed" | "unknown_failure";
  correlationIds: string[];
}

type AcceptanceOutcome = Omit<AcceptanceReport, "schema" | "sourceSha" | "startedAt" | "completedAt" | "failed" | "failureCategory">;

const inheritedMutationApproval = (env: Environment): boolean => Object.keys(env).some((name) =>
  /^NEMLIG_PRODUCTION_(?:MUTATION|RESTORATION)(?:_CONFIRMATION)?$/u.test(name) && Boolean(env[name]?.trim()));

const failureCategory = (error: unknown): NonNullable<AcceptanceReport["failureCategory"]> => {
  const message = error instanceof Error ? error.message : "";
  if (/deadline exceeded|timed out/iu.test(message)) return "deadline_exceeded";
  if (/argument|valid URL|required|approval environment|cannot select mutation|fixed production target/iu.test(message)) return "input_invalid";
  if (/edge|health|revision|OAuth|anonymous|Origin/iu.test(message)) return "edge_failed";
  if (/token|authentication|authorization/iu.test(message)) return "authentication_failed";
  if (/admin|tier usage/iu.test(message)) return "owner_admin_failed";
  if (/mutation|restor/iu.test(message)) return "mutation_failed";
  if (/connect|transport|MCP/iu.test(message)) return "transport_failed";
  if (/feature|inventory|basket|favorites|shopping|resource/iu.test(message)) return "feature_failed";
  return "unknown_failure";
};

/** Run credential-free edge, read-only, or explicitly approved reversible acceptance. */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: Environment = process.env,
  dependencies: AcceptanceEntryDependencies = defaultDependencies,
): Promise<AcceptanceOutcome> {
  const options = parseArgs(argv);
  if (options.mutation && env.CI?.trim()) throw new Error("CI acceptance cannot select mutation mode");
  if (!options.mutation && inheritedMutationApproval(env)) throw new Error("mutation approval environment is not allowed for normal acceptance");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Production acceptance deadline exceeded")), dependencies.totalTimeoutMs ?? 90_000);
  try {
    const mutations = options.mutation
      ? {
          change: approvedMutation(env, "NEMLIG_PRODUCTION_MUTATION"),
          restoration: approvedMutation(env, "NEMLIG_PRODUCTION_RESTORATION"),
        }
      : undefined;
    let origin: URL;
    try {
      origin = new URL(env.NEMLIG_PRODUCTION_MCP_URL?.trim() || "https://nemlig-mcp.broesby.dk/mcp");
    } catch {
      throw new Error("NEMLIG_PRODUCTION_MCP_URL must be a valid URL");
    }
    if (env.CI?.trim() && origin.href !== "https://nemlig-mcp.broesby.dk/mcp") {
      throw new Error("CI acceptance requires the fixed production target");
    }
    const edge = await verifyProductionEdge(origin, dependencies.fetcher, {
      expectedRevision: env.NEMLIG_EXPECTED_REVISION?.trim() || undefined,
      signal: controller.signal,
    });
    const observedRevision = /^[0-9a-f]{40}$/u.test(edge.revision) ? edge.revision : undefined;
    if (options.edgeOnly) {
      return { profile: "edge", observedRevision, required: ["edge"], passed: ["edge"], unavailable: [], lastCompletedBoundary: edge.lastCompletedBoundary, correlationIds: edge.correlationIds };
    }

    const accessToken = required(env, "NEMLIG_MCP_ACCESS_TOKEN");
    const connected = await abortable("Authenticated MCP connect", dependencies.connect(origin, accessToken, controller.signal), controller.signal);
    const closeOnAbort = () => { void connected.close().catch(() => undefined); };
    controller.signal.addEventListener("abort", closeOnAbort, { once: true });
    try {
      if (!mutations) {
        const report = await verifyReadOnlyProductionFeatures(connected.client, { signal: controller.signal });
        await verifyAggregateTierUsage(origin, accessToken, dependencies.fetcher, { signal: controller.signal });
        return { profile: "live-user", observedRevision, required: ["edge", "live_user_features", "owner_admin"], passed: ["edge", "live_user_features", "owner_admin"], unavailable: report.unavailable, lastCompletedBoundary: "owner_admin", correlationIds: edge.correlationIds };
      } else {
        await verifyApprovedReversibleProductionMutation(connected.client, mutations.change, mutations.restoration);
        return { profile: "mutation", observedRevision, required: ["edge", "approved_mutation"], passed: ["edge", "approved_mutation"], unavailable: [], lastCompletedBoundary: "approved_mutation_restored", correlationIds: edge.correlationIds };
      }
    } finally {
      controller.signal.removeEventListener("abort", closeOnAbort);
      await abortable("Authenticated MCP close", connected.close(), controller.signal);
    }
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
  try {
    const outcome = await main(argv, env, dependencies);
    const report: AcceptanceReport = { schema: 1, sourceSha, startedAt, completedAt: new Date().toISOString(), ...outcome, failed: [] };
    console.log(JSON.stringify(report));
    return report;
  } catch (error) {
    const report: AcceptanceReport = {
      schema: 1, sourceSha, startedAt, completedAt: new Date().toISOString(),
      profile: argv.includes("--mutation") ? "mutation" : argv.includes("--edge-only") ? "edge" : "live-user",
      required: [], passed: [], failed: [failureCategory(error)], unavailable: [], lastCompletedBoundary: "none",
      failureCategory: failureCategory(error), correlationIds: [],
    };
    console.log(JSON.stringify(report));
    return report;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((report) => { if (report.failed.length) process.exitCode = 1; });
}
