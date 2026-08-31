/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer, type OutboundHandler } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { createAuth0Verifier, fetchAuth0Metadata, type Auth0Config } from "./auth0.js";
import { FIXED_CONTAINER_NAME, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import { handleGatewayRequest, type GatewayDependencies } from "./cloudflare-gateway.js";
import { admitUsage, resetUsage, type AdmissionLimits, type AdmissionResult, type UsageState } from "./cloudflare-usage.js";

interface Env extends CloudflareEnv {
  NEMLIG_MCP_CONTAINER: DurableObjectNamespace<NemligMcpContainer>;
  NEMLIG_PLAN_STORAGE: DurableObjectNamespace<PlanStorage>;
}

let cachedVerifier: { key: string; verifier: OAuthTokenVerifier } | undefined;

const auth0Config = (config: GatewayConfig): Auth0Config => ({
  issuer: config.issuer,
  audience: config.audience,
  ownerSubject: config.ownerSubject,
  requiredScope: config.requiredScope,
  publicUrl: config.publicUrl,
  allowedOrigins: config.allowedOrigins,
  revision: config.revision,
  host: "0.0.0.0",
  port: 8080,
});

const authenticate = async (token: string, config: GatewayConfig): Promise<void> => {
  const key = `${config.issuer.href}\0${config.audience}\0${config.ownerSubject}\0${config.requiredScope}`;
  if (cachedVerifier?.key !== key) {
    const auth = auth0Config(config);
    const { jwksUrl } = await fetchAuth0Metadata(auth, fetch, config.authTimeoutMs);
    cachedVerifier = { key, verifier: createAuth0Verifier(auth, jwksUrl, undefined, config.authTimeoutMs) };
  }
  const verified = await cachedVerifier.verifier.verifyAccessToken(token);
  if (!verified.scopes.includes(config.requiredScope)) throw new Error("required scope missing");
};

const structuredEvent: NonNullable<GatewayDependencies["event"]> = (name, fields = {}) => {
  console.log(JSON.stringify({ event: name, ...fields }));
};

export class NemligMcpContainer extends Container<Env> {
  static outboundByHost: Record<string, OutboundHandler<Env>> = {
    "nemlig-plan-storage.internal": (request, env) =>
      env.NEMLIG_PLAN_STORAGE.jurisdiction("eu").getByName("nemlig-plans").fetch(request),
  };
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = {
    NEMLIG_MCP_AUTH0_ISSUER: this.env.NEMLIG_MCP_AUTH0_ISSUER ?? "",
    NEMLIG_MCP_AUTH0_AUDIENCE: this.env.NEMLIG_MCP_AUTH0_AUDIENCE ?? "",
    NEMLIG_MCP_AUTH0_OWNER_SUBJECT: this.env.NEMLIG_MCP_AUTH0_OWNER_SUBJECT ?? "",
    NEMLIG_MCP_REQUIRED_SCOPE: this.env.NEMLIG_MCP_REQUIRED_SCOPE ?? "use:nemlig-assistant",
    NEMLIG_MCP_PUBLIC_URL: this.env.NEMLIG_MCP_PUBLIC_URL ?? "",
    NEMLIG_MCP_ALLOWED_ORIGINS: this.env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com",
    NEMLIG_MCP_REVISION: this.env.NEMLIG_MCP_REVISION ?? "development",
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0",
    NEMLIG_MCP_HTTP_PORT: "8080",
    NEMLIG_PLAN_STORAGE_URL: "http://nemlig-plan-storage.internal/",
    NEMLIG_USERNAME: this.env.NEMLIG_USERNAME ?? "",
    NEMLIG_PASSWORD: this.env.NEMLIG_PASSWORD ?? "",
    GH_TOKEN: this.env.GH_TOKEN ?? "",
  };

  override onStart(): void {
    structuredEvent("container_started");
  }

  override onStop(): void {
    structuredEvent("container_stopped");
  }

  override onError(): void {
    structuredEvent("container_error");
  }

  async admit(operation: "protocol" | "normal" | "expensive", limits: AdmissionLimits): Promise<AdmissionResult> {
    return this.ctx.storage.transaction(async () => {
      const stored = await this.ctx.storage.get<UsageState>("usage");
      const result = admitUsage(stored, operation, limits);
      await this.ctx.storage.put("usage", result.state);
      if (result.admitted && operation !== "protocol") {
        structuredEvent("usage_admitted", {
          operation,
          normal: result.state.normalCount,
          expensive: result.state.expensiveCount,
        });
      }
      if (!result.admitted && (result.reason === "daily_limit" || result.reason === "expensive_daily_limit")) {
        structuredEvent("breaker_tripped", { reason: result.reason });
      }
      return result;
    });
  }

  async usage(): Promise<UsageState | undefined> {
    return this.ctx.storage.get<UsageState>("usage");
  }

  async resetUsage(): Promise<UsageState> {
    const state = resetUsage();
    await this.ctx.storage.put("usage", state);
    structuredEvent("breaker_reset");
    return state;
  }
}

export class PlanStorage extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const id = new URL(request.url).pathname.slice(1);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      return new Response("Invalid plan ID", { status: 400 });
    }
    const key = `plan:${id}`;
    if (request.method === "GET") {
      const snapshot = await this.ctx.storage.get<string>(key);
      return snapshot === undefined ? new Response("Not found", { status: 404 }) : new Response(snapshot, { headers: { "content-type": "application/json" } });
    }
    if (request.method !== "PUT") return new Response("Method not allowed", { status: 405 });
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (!Number.isFinite(declared) || declared < 0 || declared > 65_536) return new Response("Too large", { status: 413 });
    const snapshot = await request.text();
    if (new TextEncoder().encode(snapshot).byteLength > 65_536) return new Response("Too large", { status: 413 });
    const created = await this.ctx.storage.transaction(async () => {
      if (await this.ctx.storage.get(key) !== undefined) return false;
      await this.ctx.storage.put(key, snapshot);
      return true;
    });
    return new Response(created ? "Created" : "Already exists", { status: created ? 201 : 409 });
  }
}

export { ContainerProxy } from "@cloudflare/containers";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleGatewayRequest(request, env, {
      authenticate,
      event: structuredEvent,
      async admit(operation, config) {
        const container = getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME);
        return container.admit(operation, {
          dailyLimit: config.dailyLimit,
          expensiveDailyLimit: config.expensiveDailyLimit,
          rateLimit: config.rateLimit,
          expensiveRateLimit: config.expensiveRateLimit,
        });
      },
      async usage() {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).usage();
      },
      async resetUsage() {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).resetUsage();
      },
      async forward(original, operation, config) {
        structuredEvent("container_invoked", { operation });
        const namespace = env.NEMLIG_MCP_CONTAINER.jurisdiction("eu");
        const container = getContainer(namespace, FIXED_CONTAINER_NAME);
        const request = new Request(original, { signal: AbortSignal.timeout(config.backendTimeoutMs) });
        return container.fetch(request);
      },
    });
  },
};
