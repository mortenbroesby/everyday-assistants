import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { candidateSchema } from "../src/product-view-schema.js";

const endpoint = "https://127.0.0.1:8787/mcp";
const product = candidateSchema
  .pick({ id: true, name: true, price: true })
  .required({ id: true, name: true, price: true })
  .extend({ name: z.string().trim().min(1) });
const checks = [
  {
    name: "check_nemlig_connection",
    args: {},
    schema: z.object({ status: z.literal("connected") }),
  },
  {
    name: "find_groceries",
    args: { search_term: "banan", result_count: 3 },
    schema: z.object({
      result: z
        .array(z.unknown())
        .refine((items) =>
          items.some((item) => product.safeParse(item).success),
        ),
    }),
  },
  {
    name: "show_my_basket",
    args: {},
    schema: z.object({ items: z.array(z.object({})) }),
  },
] as const;

type ReadTool = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ isError?: unknown; structuredContent?: unknown }>;

export async function checkProvider(call: ReadTool) {
  const passed: string[] = [];
  for (const { name, args, schema } of checks) {
    try {
      const response = await call(name, args);
      if (
        response.isError ||
        !schema.safeParse(response.structuredContent).success
      ) {
        throw new Error(name);
      }
    } catch {
      throw new Error(name);
    }
    passed.push(name);
  }
  return passed;
}

async function run() {
  const token = process.env.NEMLIG_LOCAL_MCP_ACCESS_TOKEN?.trim();
  if (
    !token ||
    process.env.CI ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  ) {
    throw new Error("local_configuration");
  }
  const deadline = AbortSignal.timeout(90_000);
  const client = new Client(
    { name: "nemlig-local-provider-check", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== endpoint) {
        throw new Error("unexpected_destination");
      }
      return fetch(input, {
        ...init,
        redirect: "error",
        signal: init?.signal
          ? AbortSignal.any([deadline, init.signal])
          : deadline,
      });
    },
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  try {
    await client.connect(transport);
    return await checkProvider(
      async (name, args) => await client.callTool({ name, arguments: args }),
    );
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify({ status: "PASS", passed: await run() }));
  } catch (error) {
    const safeStages: string[] = [
      "local_configuration",
      ...checks.map((check) => check.name),
    ];
    const stage =
      error instanceof Error && safeStages.includes(error.message)
        ? error.message
        : "authenticated_mcp_transport";
    console.error(JSON.stringify({ status: "FAIL", stage }));
    process.exitCode = 1;
  }
}
