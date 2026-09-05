/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer, type OutboundHandler } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { createAuth0Verifier, fetchAuth0Metadata, type Auth0Config } from "./auth0.js";
import { FIXED_CONTAINER_NAME, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import { handleGatewayRequest, type GatewayDeadline } from "./cloudflare-gateway.js";
import { parseGatewayRequestEvent, type GatewayRequestEvent } from "./cloudflare-observability.js";
import { admitUsageAtomically, resetUsage, type AdmissionLimits, type AdmissionPrincipal, type AdmissionResult, type TierAdmissionPolicy, type UsageState } from "./cloudflare-usage.js";
import { findEnabledPrincipal, type Principal } from "./principal-policy.js";
import { handleShoppingListStorageRequest } from "./shopping-list-worker-storage.js";

interface Env extends CloudflareEnv {
  NEMLIG_MCP_CONTAINER: DurableObjectNamespace<NemligMcpContainer>;
  NEMLIG_PLAN_STORAGE: DurableObjectNamespace<PlanStorage>;
}

let cachedVerifier: { key: string; verifier: OAuthTokenVerifier } | undefined;

const auth0Config = (config: GatewayConfig): Auth0Config => ({
  issuer: config.issuer,
  audience: config.audience,
  principalPolicy: config.principalPolicy,
  requiredScope: config.requiredScope,
  publicUrl: config.publicUrl,
  allowedOrigins: config.allowedOrigins,
  revision: config.revision,
  host: "0.0.0.0",
  port: 8080,
});

const authenticate = async (token: string, config: GatewayConfig, deadline: GatewayDeadline): Promise<Principal | undefined> => {
  const key = `${config.issuer.href}\0${config.audience}\0${config.requiredScope}`;
  if (cachedVerifier?.key !== key) {
    const auth = auth0Config(config);
    const boundedFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([deadline.signal, init.signal]) : deadline.signal,
    });
    const { jwksUrl } = await fetchAuth0Metadata(auth, boundedFetch, config.authTimeoutMs);
    cachedVerifier = { key, verifier: createAuth0Verifier(auth, jwksUrl, undefined, config.authTimeoutMs) };
  }
  const verified = await cachedVerifier.verifier.verifyAccessToken(token);
  const subject = verified.extra?.subject;
  return typeof subject === "string" ? findEnabledPrincipal(config.principalPolicy, subject) : undefined;
};

const requestEvent = (event: GatewayRequestEvent): void => {
  console.log(JSON.stringify(parseGatewayRequestEvent(event)));
};

const lifecycleEvent = (
  event: "container_started" | "container_stopped" | "container_error" | "breaker_tripped" | "breaker_reset",
  reason?: "daily_limit" | "expensive_daily_limit",
): void => {
  console.log(JSON.stringify({ schema_version: 1, event, ...(reason ? { reason } : {}) }));
};

export class NemligMcpContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = {
    NEMLIG_MCP_AUTH0_ISSUER: this.env.NEMLIG_MCP_AUTH0_ISSUER ?? "",
    NEMLIG_MCP_AUTH0_AUDIENCE: this.env.NEMLIG_MCP_AUTH0_AUDIENCE ?? "",
    NEMLIG_MCP_PRINCIPALS: this.env.NEMLIG_MCP_PRINCIPALS ?? "",
    NEMLIG_MCP_REQUIRED_SCOPE: this.env.NEMLIG_MCP_REQUIRED_SCOPE ?? "use:nemlig-assistant",
    NEMLIG_MCP_PUBLIC_URL: this.env.NEMLIG_MCP_PUBLIC_URL ?? "",
    NEMLIG_MCP_ALLOWED_ORIGINS: this.env.NEMLIG_MCP_ALLOWED_ORIGINS ?? "https://chatgpt.com,https://chat.openai.com",
    NEMLIG_MCP_REVISION: this.env.NEMLIG_MCP_REVISION ?? "development",
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0",
    NEMLIG_MCP_HTTP_PORT: "8080",
    NEMLIG_PLAN_STORAGE_URL: "http://nemlig-plan-storage.internal/",
    GH_TOKEN: this.env.GH_TOKEN ?? "",
  };

  override onStart(): void {
    lifecycleEvent("container_started");
  }

  override onStop(): void {
    lifecycleEvent("container_stopped");
  }

  override onError(): void {
    lifecycleEvent("container_error");
  }

  async admit(
    operation: "protocol" | "normal" | "expensive",
    limits: AdmissionLimits,
    principal: AdmissionPrincipal,
    policy: TierAdmissionPolicy,
  ): Promise<AdmissionResult> {
    const result = await admitUsageAtomically(this.ctx.storage, operation, limits, principal, policy);
    if (!result.admitted && (result.reason === "daily_limit" || result.reason === "expensive_daily_limit")) {
      lifecycleEvent("breaker_tripped", result.reason);
    }
    return result;
  }

  async usage(): Promise<UsageState | undefined> {
    return this.ctx.storage.get<UsageState>("usage");
  }

  async resetUsage(policyRevision: string): Promise<UsageState> {
    const state = resetUsage(new Date(), policyRevision);
    await this.ctx.storage.put("usage", state);
    lifecycleEvent("breaker_reset");
    return state;
  }
}

NemligMcpContainer.outboundByHost = {
  "nemlig-plan-storage.internal": (async (request, env) => {
    const path = new URL(request.url).pathname;
    const objectName = path.startsWith("/named-lists-v2/") || path.startsWith("/lists/")
      ? "nemlig-lists-v2"
      : "nemlig-plans";
    const response = await env.NEMLIG_PLAN_STORAGE.jurisdiction("eu").getByName(objectName).fetch(request);
    return response;
  }) satisfies OutboundHandler<Env>,
};

export class PlanStorage extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.slice(1);
    if (path.startsWith("named-lists-v2/")) return this.handleShoppingLists(request, path.slice("named-lists-v2/".length));
    if (path.startsWith("lists/")) return this.handleShoppingLists(request, path.slice("lists/".length));
    const scoped = path.match(/^plans-v2\/([0-9a-f]{64})\/(.+)$/u);
    const id = scoped?.[2] ?? path;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      return new Response("Invalid plan ID", { status: 400 });
    }
    const key = scoped ? `plan:${scoped[1]}:${id}` : `plan:${id}`;
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

  private async handleShoppingLists(request: Request, ownerScope: string): Promise<Response> {
    return handleShoppingListStorageRequest(request, ownerScope, this.ctx.storage);
  }
}

export { ContainerProxy } from "@cloudflare/containers";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleGatewayRequest(request, env, {
      authenticate,
      event: requestEvent,
      async admit(operation, principal, config) {
        const container = getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME);
        return container.admit(operation, {
          dailyLimit: config.dailyLimit,
          expensiveDailyLimit: config.expensiveDailyLimit,
          rateLimit: config.rateLimit,
          expensiveRateLimit: config.expensiveRateLimit,
        }, { principalKey: principal.principal_key, tier: principal.tier }, {
          revision: config.principalPolicy.revision,
          budgets: config.principalPolicy.budgets,
          principalKeys: config.principalPolicy.principals.map(({ principal_key }) => principal_key),
        });
      },
      async usage() {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).usage();
      },
      async resetUsage(config) {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).resetUsage(config.principalPolicy.revision);
      },
      async forward(original, _operation, _config, deadline) {
        const namespace = env.NEMLIG_MCP_CONTAINER.jurisdiction("eu");
        const container = getContainer(namespace, FIXED_CONTAINER_NAME);
        const request = new Request(original, { signal: deadline.signal });
        return container.fetch(request);
      },
    });
  },
};
