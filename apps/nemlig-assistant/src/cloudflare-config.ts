export const FIXED_CONTAINER_NAME = "nemlig-production";

export interface CloudflareEnv {
  MCP_ENABLED?: string;
  MCP_DAILY_LIMIT?: string;
  MCP_EXPENSIVE_DAILY_LIMIT?: string;
  MCP_RATE_LIMIT?: string;
  MCP_EXPENSIVE_RATE_LIMIT?: string;
  MCP_AUTH_TIMEOUT_MS?: string;
  MCP_CONTROL_TIMEOUT_MS?: string;
  MCP_TOTAL_TIMEOUT_MS?: string;
  MCP_BACKEND_TIMEOUT_MS?: string;
  NEMLIG_MCP_AUTH0_ISSUER?: string;
  NEMLIG_MCP_AUTH0_AUDIENCE?: string;
  NEMLIG_MCP_AUTH0_OWNER_SUBJECT?: string;
  NEMLIG_MCP_REQUIRED_SCOPE?: string;
  NEMLIG_MCP_PUBLIC_URL?: string;
  NEMLIG_MCP_ALLOWED_ORIGINS?: string;
  NEMLIG_MCP_REVISION?: string;
  NEMLIG_USERNAME?: string;
  NEMLIG_PASSWORD?: string;
  GH_TOKEN?: string;
}

export interface GatewayConfig {
  dailyLimit: number;
  expensiveDailyLimit: number;
  rateLimit: number;
  expensiveRateLimit: number;
  authTimeoutMs: number;
  controlTimeoutMs: number;
  totalTimeoutMs: number;
  backendTimeoutMs: number;
  issuer: URL;
  audience: string;
  ownerSubject: string;
  requiredScope: string;
  publicUrl: URL;
  allowedOrigins: string[];
  revision: string;
}

const required = (env: CloudflareEnv, name: keyof CloudflareEnv): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const boundedInteger = (env: CloudflareEnv, name: keyof CloudflareEnv, maximum: number): number => {
  const value = Number(required(env, name));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}.`);
  }
  return value;
};

export function loadGatewayConfig(env: CloudflareEnv): GatewayConfig {
  const dailyLimit = boundedInteger(env, "MCP_DAILY_LIMIT", 100_000);
  const expensiveDailyLimit = boundedInteger(env, "MCP_EXPENSIVE_DAILY_LIMIT", dailyLimit);
  const rateLimit = boundedInteger(env, "MCP_RATE_LIMIT", 600);
  const expensiveRateLimit = boundedInteger(env, "MCP_EXPENSIVE_RATE_LIMIT", rateLimit);
  const authTimeoutMs = boundedInteger(env, "MCP_AUTH_TIMEOUT_MS", 10_000);
  const controlTimeoutMs = boundedInteger(env, "MCP_CONTROL_TIMEOUT_MS", 10_000);
  const totalTimeoutMs = boundedInteger(env, "MCP_TOTAL_TIMEOUT_MS", 120_000);
  const backendTimeoutMs = boundedInteger(env, "MCP_BACKEND_TIMEOUT_MS", 120_000);
  if (authTimeoutMs >= totalTimeoutMs) throw new Error("MCP_AUTH_TIMEOUT_MS must be less than MCP_TOTAL_TIMEOUT_MS.");
  if (controlTimeoutMs >= totalTimeoutMs) throw new Error("MCP_CONTROL_TIMEOUT_MS must be less than MCP_TOTAL_TIMEOUT_MS.");
  if (backendTimeoutMs >= totalTimeoutMs) throw new Error("MCP_BACKEND_TIMEOUT_MS must be less than MCP_TOTAL_TIMEOUT_MS.");
  const issuer = new URL(required(env, "NEMLIG_MCP_AUTH0_ISSUER"));
  const publicUrl = new URL(required(env, "NEMLIG_MCP_PUBLIC_URL"));
  if (issuer.protocol !== "https:" || issuer.search || issuer.hash) throw new Error("NEMLIG_MCP_AUTH0_ISSUER must be an HTTPS URL without query or fragment.");
  if (!issuer.pathname.endsWith("/")) issuer.pathname += "/";
  if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/mcp" || publicUrl.search || publicUrl.hash) {
    throw new Error("NEMLIG_MCP_PUBLIC_URL must be an HTTPS /mcp URL without query or fragment.");
  }
  return {
    dailyLimit,
    expensiveDailyLimit,
    rateLimit,
    expensiveRateLimit,
    authTimeoutMs,
    controlTimeoutMs,
    totalTimeoutMs,
    backendTimeoutMs,
    issuer,
    audience: required(env, "NEMLIG_MCP_AUTH0_AUDIENCE"),
    ownerSubject: required(env, "NEMLIG_MCP_AUTH0_OWNER_SUBJECT"),
    requiredScope: env.NEMLIG_MCP_REQUIRED_SCOPE?.trim() || "use:nemlig-assistant",
    publicUrl,
    allowedOrigins: (env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com")
      .split(",").map((value) => value.trim()).filter(Boolean),
    revision: env.NEMLIG_MCP_REVISION?.trim() || "development",
  };
}
