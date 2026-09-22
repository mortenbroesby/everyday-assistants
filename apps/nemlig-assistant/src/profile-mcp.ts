import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface ProfileRequestContext {
  principalKey: string;
  policyRevision: string;
  tier: 0 | 1 | 2;
  kind?: "service";
}

const success = (value: { id: string }) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
});

export function registerProfileTool(
  server: McpServer,
  requestContext: ProfileRequestContext | undefined,
  requiredScope = "use:nemlig-assistant",
  onCall?: () => void,
  onComplete?: () => void,
): void {
  server.registerTool(
    "get_profile",
    {
      title: "Get my Nemlig profile",
      description: "Return the stable profile represented by this authenticated Nemlig connection.",
      inputSchema: {},
      outputSchema: z.object({ id: z.string().trim().min(1) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { "openai/profile": true, securitySchemes: [{ type: "oauth2", scopes: [requiredScope] }] },
    },
    async () => {
      onCall?.();
      const id = requestContext?.principalKey;
      if (!id) return { isError: true, content: [{ type: "text" as const, text: "Authenticated profile unavailable." }] };
      const result = success({ id });
      onComplete?.();
      return result;
    },
  );
}
