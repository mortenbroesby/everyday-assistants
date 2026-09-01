import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  verifyApprovedProductionAddition,
  verifyProductionEdge,
  type ApprovedAddition,
} from "../src/production-acceptance.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const positive = (name: string): number => {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
};

const origin = new URL(process.env.NEMLIG_PRODUCTION_MCP_URL ?? "https://nemlig-mcp.broesby.dk/mcp");
await verifyProductionEdge(origin);
if (process.argv.includes("--edge-only")) {
  console.log(`Verified production edge: ${origin.origin}.`);
  process.exit(0);
}

const approved: ApprovedAddition = {
  productId: positive("NEMLIG_PRODUCTION_TEST_PRODUCT_ID"),
  productName: required("NEMLIG_PRODUCTION_TEST_PRODUCT_NAME"),
  unitSize: required("NEMLIG_PRODUCTION_TEST_UNIT_SIZE"),
  quantity: positive("NEMLIG_PRODUCTION_TEST_QUANTITY"),
  unitPrice: positive("NEMLIG_PRODUCTION_TEST_UNIT_PRICE"),
  lineTotal: positive("NEMLIG_PRODUCTION_TEST_LINE_TOTAL"),
};
const expectedApproval = JSON.stringify(approved);
if (required("NEMLIG_PRODUCTION_TEST_APPROVAL") !== expectedApproval) {
  throw new Error(`Exact approval missing. After owner approval, set NEMLIG_PRODUCTION_TEST_APPROVAL to: ${expectedApproval}`);
}

const client = new Client({ name: "nemlig-production-acceptance", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(origin, {
  requestInit: { headers: { authorization: `Bearer ${required("NEMLIG_MCP_ACCESS_TOKEN")}` } },
});
try {
  await client.connect(transport);
  await verifyApprovedProductionAddition({
    listTools: () => client.listTools(),
    callTool: async (request) => await client.callTool(request) as {
      isError?: boolean;
      structuredContent?: unknown;
    },
  }, approved);
  console.log(`Verified production addition: ${approved.quantity} × ${approved.productName} (ID ${approved.productId}).`);
} finally {
  await client.close();
}
