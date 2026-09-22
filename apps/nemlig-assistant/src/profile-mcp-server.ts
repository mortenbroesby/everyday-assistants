import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProfileTool, type ProfileRequestContext } from "./profile-mcp.js";

export function createProfileMcpServer(
  requestContext: ProfileRequestContext,
  requiredScope: string,
  onCall?: () => void,
  onComplete?: () => void,
): McpServer {
  const server = new McpServer({ name: "nemlig-assistant", title: "Nemlig Assistant", version: "recovery-profile" });
  registerProfileTool(server, requestContext, requiredScope, onCall, onComplete);
  return server;
}
