/// <reference types="@cloudflare/workers-types" />

import { Container, getContainer } from "@cloudflare/containers";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/express";
import { DurableObject } from "cloudflare:workers";
import { createAuth0Verifier, fetchAuth0Metadata, SERVICE_ACCEPTANCE_SCOPE, type Auth0Config } from "./auth0.js";
import { FIXED_CONTAINER_NAME, loadGatewayConfig, type CloudflareEnv, type GatewayConfig } from "./cloudflare-config.js";
import { attachAdmissionCredential, handleGatewayRequest, type GatewayDeadline } from "./cloudflare-gateway.js";
import { parseGatewayRequestEvent, type GatewayRequestEvent } from "./cloudflare-observability.js";
import type { AdmissionPrincipal, AdmissionResult, AdmissionPolicy } from "./principal-records.js";
import { findEnabledPrincipal, type Principal } from "./principal-policy.js";
import { admitPrincipalRequest, consumePortalCsrf, findPrincipalRecord, getCredentialRecord, replaceCredentialRecord, revokeCredentialRecord, setPrincipalStatus } from "./principal-records.js";
import { encryptCredentials } from "./credential-envelope.js";
import type { Credentials } from "./config.js";
import { handleOnboardingRequest } from "./onboarding.js";

interface Env extends CloudflareEnv {
  NEMLIG_MCP_CONTAINER: DurableObjectNamespace<NemligMcpContainer>;
  NEMLIG_PLAN_STORAGE: DurableObjectNamespace<PlanStorage>;
}

/**
 * Wrangler's local Container simulator does not execute jurisdictional
 * subnamespaces. Production keeps the EU-restricted namespace; local runs
 * use the same binding without the placement selector so Colima can launch
 * the actual configured Container image.
 */
const containerNamespace = (env: Env): DurableObjectNamespace<NemligMcpContainer> =>
  env.NEMLIG_MCP_REVISION === "local" ? env.NEMLIG_MCP_CONTAINER : env.NEMLIG_MCP_CONTAINER.jurisdiction("eu");

let cachedVerifier: { key: string; verifier: OAuthTokenVerifier } | undefined;

const auth0Config = (config: GatewayConfig): Auth0Config => ({
  issuer: config.issuer,
  audience: config.audience,
  principalPolicy: config.principalPolicy,
  credentialKey: config.credentialKey,
  credentialKeyVersion: config.credentialKeyVersion,
  requiredScope: config.requiredScope,
  ...(config.serviceAcceptance ? { serviceAcceptance: config.serviceAcceptance } : {}),
  publicUrl: config.publicUrl,
  allowedOrigins: config.allowedOrigins,
  revision: config.revision,
  host: "0.0.0.0",
  port: 8080,
});

interface VerifiedSubject {
  subject: string;
  clientId: string;
  scopes: string[];
}

const authenticateSubject = async (token: string, config: GatewayConfig, deadline: GatewayDeadline): Promise<VerifiedSubject | undefined> => {
  const key = `${config.issuer.href}\0${config.audience}\0${config.requiredScope}\0${config.serviceAcceptance?.clientId ?? ""}`;
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
  return typeof subject === "string" ? { subject, clientId: verified.clientId, scopes: verified.scopes } : undefined;
};

const isVerifiedServicePrincipal = (principal: Principal, config: GatewayConfig): boolean =>
  !!config.serviceAcceptance
  && principal.principal_key === "s".repeat(32)
  && principal.subject === `${config.serviceAcceptance.clientId}@clients`;

const requestEvent = (event: GatewayRequestEvent): void => {
  console.log(JSON.stringify(parseGatewayRequestEvent(event)));
};

const lifecycleEvent = (
  event: "container_started" | "container_stopped" | "container_error",
): void => {
  console.log(JSON.stringify({ schema_version: 1, event }));
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
    NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED: this.env.NEMLIG_MCP_SERVICE_ACCEPTANCE_ENABLED ?? "false",
    NEMLIG_MCP_SERVICE_CLIENT_ID: this.env.NEMLIG_MCP_SERVICE_CLIENT_ID ?? "",
    NEMLIG_MCP_HTTP_HOST: "0.0.0.0",
    NEMLIG_MCP_HTTP_PORT: "8080",
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
    principal: AdmissionPrincipal,
    policy: AdmissionPolicy,
    credentialRequired: boolean,
  ): Promise<AdmissionResult> {
    return admitPrincipalRequest(this.ctx.storage, principal, policy, credentialRequired);
  }

  async principal(configured: Principal): Promise<Principal | undefined> {
    const record = await findPrincipalRecord(this.ctx.storage, configured.subject);
    if (record && (record.status !== "enabled" || record.principal_key !== configured.principal_key)) return undefined;
    return configured;
  }

  async principalStatus(subject: string): Promise<"owner" | "pending" | "enabled" | undefined> {
    const policy = loadGatewayConfig(this.env).principalPolicy;
    const configured = findEnabledPrincipal(policy, subject);
    if (!configured) return undefined;
    if (subject === policy.owner_subject) return "owner";
    const record = await findPrincipalRecord(this.ctx.storage, subject);
    if (record && record.principal_key !== configured.principal_key) return undefined;
    return !record ? "enabled" : record.status === "pending" || record.status === "enabled" ? record.status : undefined;
  }

  private async managementPrincipal(subject: string): Promise<Principal | undefined> {
    const policy = loadGatewayConfig(this.env).principalPolicy;
    const configured = findEnabledPrincipal(policy, subject);
    if (!configured) return undefined;
    if (subject === policy.owner_subject) return configured;
    const record = await findPrincipalRecord(this.ctx.storage, subject);
    if (record && (record.principal_key !== configured.principal_key
      || (record.status !== "pending" && record.status !== "enabled"))) return undefined;
    return configured;
  }

  async connectionStatus(subject: string): Promise<boolean> {
    const principal = await this.managementPrincipal(subject);
    return Boolean(principal && await getCredentialRecord(this.ctx.storage, principal));
  }

  async replaceCredential(
    subject: string,
    credentials: Credentials,
  ): Promise<"connected" | "invalid"> {
    const principal = await this.managementPrincipal(subject);
    if (!principal || !this.env.NEMLIG_MCP_CREDENTIAL_KEY) return "invalid";
    const config = loadGatewayConfig(this.env);
    const current = await getCredentialRecord(this.ctx.storage, principal);
    const generation = (current?.generation ?? 0) + 1;
    const envelope = await encryptCredentials(credentials, {
      principalKey: principal.principal_key,
      policyRevision: config.principalPolicy.revision,
      keyVersion: config.credentialKeyVersion,
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
    return "connected";
  }

  async revokeCredential(subject: string): Promise<void> {
    const principal = await this.managementPrincipal(subject);
    if (principal) await revokeCredentialRecord(this.ctx.storage, principal);
  }

  async setInviteeStatus(subject: string, status: "disabled" | "revoked"): Promise<void> {
    const policy = loadGatewayConfig(this.env).principalPolicy;
    const principal = policy.principals.find((member) => member.subject === subject);
    if (!principal || subject === policy.owner_subject) throw new Error("Access update rejected.");
    const record = await setPrincipalStatus(this.ctx.storage, principal, status);
    if (!record || record.status !== status) throw new Error("Access update rejected.");
  }

  async consumePortalCsrf(subject: string, csrf: string, expiresAt: number): Promise<boolean> {
    return consumePortalCsrf(this.ctx.storage, subject, csrf, expiresAt);
  }

  async listInvitees(): Promise<Array<{ subject: string; status: "pending" | "enabled" | "disabled" | "revoked" }>> {
    const policy = loadGatewayConfig(this.env).principalPolicy;
    return Promise.all(policy.principals.filter(({ subject }) => subject !== policy.owner_subject).map(async (principal) => {
      const record = await findPrincipalRecord(this.ctx.storage, principal.subject);
      return { subject: principal.subject,
        status: !principal.enabled ? "disabled" : record?.status ?? "enabled" };
    }));
  }

}

// ponytail: retain the retired namespace and data; remove only with approved data cleanup.
export class PlanStorage extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response("Saved shopping storage retired", { status: 410 });
  }
}

export { ContainerProxy } from "@cloudflare/containers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/connect")) {
      return handleOnboardingRequest(request, env, {
        async authenticate(token) {
          const config = loadGatewayConfig(env);
          const deadline: GatewayDeadline = { signal: AbortSignal.timeout(config.authTimeoutMs), remainingMs: config.authTimeoutMs };
          const identity = await authenticateSubject(token, config, deadline);
          if (!identity) return undefined;
          const service = config.serviceAcceptance
            && identity.clientId === config.serviceAcceptance.clientId
            && identity.subject === `${config.serviceAcceptance.clientId}@clients`
            && identity.scopes.length === 1 && identity.scopes[0] === SERVICE_ACCEPTANCE_SCOPE;
          if (service) return undefined;
          const configured = findEnabledPrincipal(config.principalPolicy, identity.subject);
          return configured?.subject;
        },
        async principalStatus(subject) {
          return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).principalStatus(subject);
        },
        async connectionStatus(subject) {
          return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).connectionStatus(subject);
        },
        async replace(subject, credentials) {
          return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).replaceCredential(subject, credentials);
        },
        async revoke(subject) {
          return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).revokeCredential(subject);
        },
        async listPrincipals() {
          return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).listInvitees();
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
        const identity = await authenticateSubject(token, config, deadline);
        if (!identity) return undefined;
        const service = config.serviceAcceptance
          && identity.clientId === config.serviceAcceptance.clientId
          && identity.subject === `${config.serviceAcceptance.clientId}@clients`
          && identity.scopes.length === 1 && identity.scopes[0] === SERVICE_ACCEPTANCE_SCOPE;
        if (service) return { subject: identity.subject, principal_key: "s".repeat(32), enabled: true };
        const configured = findEnabledPrincipal(config.principalPolicy, identity.subject);
        if (!configured) return undefined;
        return getContainer(containerNamespace(env), FIXED_CONTAINER_NAME).principal(configured);
      },
      event: requestEvent,
      async admit(operation, principal, config) {
        const container = getContainer(containerNamespace(env), FIXED_CONTAINER_NAME);
        return container.admit({ principalKey: principal.principal_key }, {
          revision: config.principalPolicy.revision,
        }, operation !== "protocol"
          && !isVerifiedServicePrincipal(principal, config));
      },
      async forward(original, _operation, _config, deadline, admission) {
        const namespace = containerNamespace(env);
        const container = getContainer(namespace, FIXED_CONTAINER_NAME);
        const request = attachAdmissionCredential(original, admission, deadline.signal);
        return container.fetch(request);
      },
    });
  },
};
