/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer, type OutboundHandler } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet } from "jose";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { createAuth0Verifier, fetchAuth0Metadata, verifyAuth0BrowserIdToken, type Auth0Config } from "./auth0.js";
import { FIXED_CONTAINER_NAME, loadGatewayConfig, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import { attachAdmissionCredential, handleGatewayRequest, type GatewayDeadline } from "./cloudflare-gateway.js";
import { parseGatewayRequestEvent, type GatewayRequestEvent } from "./cloudflare-observability.js";
import { resetUsage, type AdmissionLimits, type AdmissionPrincipal, type AdmissionResult, type TierAdmissionPolicy, type UsageState } from "./cloudflare-usage.js";
import { findEnabledPrincipal, type Principal } from "./principal-policy.js";
import { admitPrincipalRequest, consumePortalCsrf, consumeValidationRate, findPrincipalRecord, getCredentialRecord, listPrincipalRecords, registerInvitedPrincipal, replaceCredentialRecord, revokeCredentialRecord, setPrincipalStatus } from "./principal-records.js";
import { handleShoppingListStorageRequest } from "./shopping-list-worker-storage.js";
import { encryptCredentials } from "./credential-envelope.js";
import type { Credentials } from "./config.js";
import { handleOnboardingRequest, loadOnboardingConfig, type BrowserIdentity, type OnboardingConfig } from "./onboarding.js";

interface Env extends CloudflareEnv {
  NEMLIG_MCP_CONTAINER: DurableObjectNamespace<NemligMcpContainer>;
  NEMLIG_PLAN_STORAGE: DurableObjectNamespace<PlanStorage>;
}

let cachedVerifier: { key: string; verifier: OAuthTokenVerifier } | undefined;
let cachedBrowserJwks: { url: string; key: ReturnType<typeof createRemoteJWKSet> } | undefined;

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

const authenticateSubject = async (token: string, config: GatewayConfig, deadline: GatewayDeadline): Promise<string | undefined> => {
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
  return typeof subject === "string" ? subject : undefined;
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
    NEMLIG_MCP_CREDENTIAL_KEY: this.env.NEMLIG_MCP_CREDENTIAL_KEY ?? "",
    NEMLIG_MCP_CREDENTIAL_KEY_VERSION: this.env.NEMLIG_MCP_CREDENTIAL_KEY_VERSION ?? "",
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
    credentialRequired: boolean,
  ): Promise<AdmissionResult> {
    const result = await admitPrincipalRequest(this.ctx.storage, operation, limits, principal, policy, credentialRequired);
    if (!result.admitted && (result.reason === "daily_limit" || result.reason === "expensive_daily_limit")) {
      lifecycleEvent("breaker_tripped", result.reason);
    }
    return result;
  }

  async principal(subject: string): Promise<Principal | undefined> {
    const record = await findPrincipalRecord(this.ctx.storage, subject);
    return record?.status === "enabled" ? {
      subject: record.subject,
      principal_key: record.principal_key,
      tier: record.tier,
      enabled: true,
    } : undefined;
  }

  async principalStatus(subject: string, ownerSubject: string): Promise<"owner" | "pending" | "enabled" | undefined> {
    if (subject === ownerSubject) return "owner";
    const record = await findPrincipalRecord(this.ctx.storage, subject);
    return record?.status === "pending" || record?.status === "enabled" ? record.status : undefined;
  }

  async register(input: { subject: string; organizationId: string; invitationIdHash: string }): Promise<void> {
    await registerInvitedPrincipal(this.ctx.storage, input);
  }

  private async managementPrincipal(subject: string, owner: Principal): Promise<Principal | undefined> {
    if (subject === owner.subject) return owner;
    const record = await findPrincipalRecord(this.ctx.storage, subject);
    return record && (record.status === "pending" || record.status === "enabled") ? {
      subject: record.subject, principal_key: record.principal_key, tier: record.tier, enabled: record.status === "enabled",
    } : undefined;
  }

  async connectionStatus(subject: string, owner: Principal): Promise<boolean> {
    const principal = await this.managementPrincipal(subject, owner);
    return Boolean(principal && await getCredentialRecord(this.ctx.storage, principal));
  }

  async replaceCredential(
    subject: string,
    owner: Principal,
    credentials: Credentials,
    input: { policyRevision: string; keyVersion: string; perPrincipalRate: number; globalRate: number },
  ): Promise<"connected" | "invalid" | "limited"> {
    const principal = await this.managementPrincipal(subject, owner);
    if (!principal || !this.env.NEMLIG_MCP_CREDENTIAL_KEY
      || !await consumeValidationRate(this.ctx.storage, principal.principal_key, input.perPrincipalRate, input.globalRate)) return principal ? "limited" : "invalid";
    const current = await getCredentialRecord(this.ctx.storage, principal);
    const generation = (current?.generation ?? 0) + 1;
    const envelope = await encryptCredentials(credentials, {
      principalKey: principal.principal_key,
      policyRevision: input.policyRevision,
      keyVersion: input.keyVersion,
      generation,
    }, this.env.NEMLIG_MCP_CREDENTIAL_KEY);
    const headers = {
      "x-nemlig-credential-envelope": btoa(JSON.stringify(envelope)),
      "x-nemlig-principal-key": envelope.principal_key,
      "x-nemlig-policy-revision": envelope.policy_revision,
      "x-nemlig-credential-generation": String(envelope.generation),
    };
    const validation = await this.fetch(new Request("http://container.internal/__credential-validation", { method: "POST", headers }));
    if (!validation.ok) return "invalid";
    await replaceCredentialRecord(this.ctx.storage, principal, envelope, true);
    if (subject !== owner.subject) await setPrincipalStatus(this.ctx.storage, subject, "enabled", true);
    return "connected";
  }

  async revokeCredential(subject: string, owner: Principal): Promise<void> {
    const principal = await this.managementPrincipal(subject, owner);
    if (principal) await revokeCredentialRecord(this.ctx.storage, principal);
  }

  async setInviteeStatus(subject: string, status: "disabled" | "revoked"): Promise<void> {
    await setPrincipalStatus(this.ctx.storage, subject, status);
  }

  async consumePortalCsrf(subject: string, csrf: string, expiresAt: number): Promise<boolean> {
    return consumePortalCsrf(this.ctx.storage, subject, csrf, expiresAt);
  }

  async listInvitees(): Promise<Array<{ subject: string; status: "pending" | "enabled" | "disabled" | "revoked" }>> {
    return (await listPrincipalRecords(this.ctx.storage)).map(({ subject, status }) => ({ subject, status }));
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

const exchangeBrowserCode = async (
  input: { code: string; verifier: string; nonce: string; organizationId: string },
  config: OnboardingConfig,
  signal: AbortSignal,
): Promise<BrowserIdentity> => {
  const { oauth, jwksUrl } = await fetchAuth0Metadata({
    issuer: config.issuer, audience: config.clientId, principalPolicy: config.principalPolicy,
    requiredScope: "openid", publicUrl: new URL("/mcp", config.origin), allowedOrigins: [], revision: "browser", host: "0.0.0.0", port: 8080,
  }, fetch, 5_000);
  if (!oauth.token_endpoint) throw new Error("Auth0 token endpoint missing");
  const body = new URLSearchParams({
    grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret,
    code: input.code, code_verifier: input.verifier, redirect_uri: config.callbackUrl.href,
  });
  const tokenResponse = await fetch(oauth.token_endpoint, { method: "POST", signal, headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!tokenResponse.ok) throw new Error("Auth0 code exchange failed");
  const token = await tokenResponse.json() as { id_token?: unknown };
  if (typeof token.id_token !== "string" || token.id_token.length > 16_384) throw new Error("Auth0 ID token missing");
  if (cachedBrowserJwks?.url !== jwksUrl.href) cachedBrowserJwks = { url: jwksUrl.href, key: createRemoteJWKSet(jwksUrl, { timeoutDuration: 5_000 }) };
  return verifyAuth0BrowserIdToken(token.id_token, {
    issuer: config.issuer, clientId: config.clientId, nonce: input.nonce, organizationId: input.organizationId,
  }, cachedBrowserJwks.key);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/connect")) {
      return handleOnboardingRequest(request, env, {
        exchangeCode: exchangeBrowserCode,
        async principalStatus(subject) {
          const config = loadGatewayConfig(env);
          const owner = config.principalPolicy.principals.find(({ tier }) => tier === 0)!;
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).principalStatus(subject, owner.subject);
        },
        async register(input) {
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).register(input);
        },
        async connectionStatus(subject) {
          const config = loadGatewayConfig(env);
          const owner = config.principalPolicy.principals.find(({ tier }) => tier === 0)!;
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).connectionStatus(subject, owner);
        },
        async replace(subject, credentials) {
          const config = loadGatewayConfig(env);
          const onboarding = loadOnboardingConfig(env);
          const owner = config.principalPolicy.principals.find(({ tier }) => tier === 0)!;
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).replaceCredential(subject, owner, credentials, {
            policyRevision: config.principalPolicy.revision,
            keyVersion: onboarding.credentialKeyVersion,
            perPrincipalRate: onboarding.perPrincipalRate,
            globalRate: onboarding.globalRate,
          });
        },
        async revoke(subject) {
          const config = loadGatewayConfig(env);
          const owner = config.principalPolicy.principals.find(({ tier }) => tier === 0)!;
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).revokeCredential(subject, owner);
        },
        async listPrincipals() {
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).listInvitees();
        },
        async setPrincipalStatus(subject, status) {
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).setInviteeStatus(subject, status);
        },
        async consumeCsrf(subject, csrf, expiresAt) {
          return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).consumePortalCsrf(subject, csrf, expiresAt);
        },
      });
    }
    return handleGatewayRequest(request, env, {
      async authenticate(token, config, deadline) {
        const subject = await authenticateSubject(token, config, deadline);
        if (!subject) return undefined;
        const configured = findEnabledPrincipal(config.principalPolicy, subject);
        if (configured) return configured;
        if (config.principalPolicy.schema_version !== 2) return undefined;
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).principal(subject);
      },
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
        }, config.principalPolicy.schema_version === 2);
      },
      async usage() {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).usage();
      },
      async resetUsage(config) {
        return getContainer(env.NEMLIG_MCP_CONTAINER.jurisdiction("eu"), FIXED_CONTAINER_NAME).resetUsage(config.principalPolicy.revision);
      },
      async forward(original, _operation, _config, deadline, admission) {
        const namespace = env.NEMLIG_MCP_CONTAINER.jurisdiction("eu");
        const container = getContainer(namespace, FIXED_CONTAINER_NAME);
        const request = attachAdmissionCredential(original, admission, deadline.signal);
        return container.fetch(request);
      },
    });
  },
};
