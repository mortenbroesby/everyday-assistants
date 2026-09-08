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
  connect(origin: URL, token: string): Promise<ConnectedAcceptanceClient>;
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

const withinDeadline = async <T>(label: string, work: Promise<T>, timeoutMs = 90_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const defaultConnect = async (origin: URL, token: string): Promise<ConnectedAcceptanceClient> => {
  const client = new Client({ name: "nemlig-production-acceptance", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(origin, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  try {
    await withinDeadline("Authenticated MCP connect", client.connect(transport));
  } catch (error) {
    await client.close();
    throw error;
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
    close: () => client.close(),
  };
};

const defaultDependencies: AcceptanceEntryDependencies = { fetcher: fetch, connect: defaultConnect };

/** Run credential-free edge, read-only, or explicitly approved reversible acceptance. */
export async function main(
  argv: string[] = process.argv.slice(2),
  env: Environment = process.env,
  dependencies: AcceptanceEntryDependencies = defaultDependencies,
): Promise<void> {
  const options = parseArgs(argv);
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
  const edge = await verifyProductionEdge(origin, dependencies.fetcher, {
    expectedRevision: env.NEMLIG_EXPECTED_REVISION?.trim() || undefined,
  });
  if (options.edgeOnly) {
    console.log(`Verified production edge ${origin.origin} at revision ${edge.revision}; last boundary ${edge.lastCompletedBoundary}; ${edge.steps.map(({ boundary, latencyMs }) => `${boundary}=${latencyMs}ms`).join(", ")}.`);
    return;
  }

  const accessToken = required(env, "NEMLIG_MCP_ACCESS_TOKEN");
  const connected = await dependencies.connect(origin, accessToken);
  try {
    if (!mutations) {
      const report = await verifyReadOnlyProductionFeatures(connected.client);
      await verifyAggregateTierUsage(origin, accessToken, dependencies.fetcher);
      console.log(`Verified ${report.exercised.length} production feature paths without external-state writes.`);
    } else {
      await verifyApprovedReversibleProductionMutation(connected.client, mutations.change, mutations.restoration);
      console.log(`Verified and restored one production ${mutations.change.operation} mutation.`);
    }
  } finally {
    await connected.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Production acceptance failed");
    process.exitCode = 1;
  });
}
