import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  verifyApprovedReversibleProductionMutation,
  verifyProductionEdge,
  verifyReadOnlyProductionFeatures,
  type AcceptanceClient,
  type ApprovedProductionMutation,
} from "../src/production-acceptance.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const approvedMutation = (name: string): ApprovedProductionMutation => {
  const serialized = required(name);
  if (required(`${name}_CONFIRMATION`) !== serialized) throw new Error(`${name}_CONFIRMATION must exactly repeat the approved envelope`);
  const value = JSON.parse(serialized) as ApprovedProductionMutation;
  if (!value || typeof value !== "object") throw new Error(`${name} must be a JSON object`);
  return value;
};

const withinDeadline = async <T>(label: string, work: Promise<T>, timeoutMs = 30_000): Promise<T> => {
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

const origin = new URL(process.env.NEMLIG_PRODUCTION_MCP_URL ?? "https://nemlig-mcp.broesby.dk/mcp");
const edge = await verifyProductionEdge(origin, fetch, {
  expectedRevision: process.env.NEMLIG_EXPECTED_REVISION?.trim() || undefined,
});
if (process.argv.includes("--edge-only")) {
  console.log(`Verified production edge ${origin.origin} at revision ${edge.revision}; last boundary ${edge.lastCompletedBoundary}; ${edge.steps.map(({ boundary, latencyMs }) => `${boundary}=${latencyMs}ms`).join(", ")}.`);
  process.exit(0);
}

const client = new Client({ name: "nemlig-production-acceptance", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(origin, {
  requestInit: { headers: { authorization: `Bearer ${required("NEMLIG_MCP_ACCESS_TOKEN")}` } },
});
try {
  await withinDeadline("Authenticated MCP connect", client.connect(transport));
  const acceptanceClient: AcceptanceClient = {
    listTools: () => client.listTools(),
    listResources: () => client.listResources(),
    readResource: (request: { uri: string }) => client.readResource(request),
    callTool: async (request) => await client.callTool(request) as {
      isError?: boolean;
      structuredContent?: unknown;
    },
  };
  if (!process.argv.includes("--mutation")) {
    const report = await verifyReadOnlyProductionFeatures(acceptanceClient);
    console.log(`Verified ${report.exercised.length} production feature paths without external-state writes.`);
  } else {
    const change = approvedMutation("NEMLIG_PRODUCTION_MUTATION");
    const restoration = approvedMutation("NEMLIG_PRODUCTION_RESTORATION");
    await verifyApprovedReversibleProductionMutation(acceptanceClient, change, restoration);
    console.log(`Verified and restored one production ${change.operation} mutation.`);
  }
} finally {
  await client.close();
}
