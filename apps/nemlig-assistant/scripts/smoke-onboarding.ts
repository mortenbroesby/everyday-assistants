/** Loopback-only native-form regression: real portal/cookies/CSRF, no OAuth or Nemlig access.
 * Open the printed URL in Chrome, enter fixture@example.test / fixture-password,
 * click Connect, then Revoke connection. Both must succeed with same-origin POSTs.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { handleOnboardingRequest, type OnboardingDependencies } from "../src/onboarding.js";
import { consumePortalCsrf, type PrincipalStorage } from "../src/principal-records.js";
import type { CloudflareEnv } from "../src/cloudflare-config.js";

const canonical = "https://portal.example.test";
const subject = "auth0|fixture";
const env: CloudflareEnv = {
  MCP_ENABLED: "false", MCP_CREDENTIAL_ONBOARDING_ENABLED: "true",
  NEMLIG_MCP_PUBLIC_URL: `${canonical}/mcp`,
  NEMLIG_MCP_ONBOARDING_SESSION_KEY: Buffer.alloc(32, 1).toString("base64url"),
  NEMLIG_MCP_CREDENTIAL_KEY: Buffer.alloc(32, 2).toString("base64url"),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: "fixture",
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({ schema_version: 3, revision: "fixture",
    owner_subject: subject, principals: [{ subject, principal_key: "a".repeat(32), enabled: true }] }),
};
const values = new Map<string, unknown>();
const storage: PrincipalStorage = {
  transaction: async (callback) => callback(),
  get: async <T>(key: string) => values.get(key) as T | undefined,
  put: async (key, value) => { values.set(key, value); },
  delete: async (key) => values.delete(key),
};
let connected = false, replacements = 0, revocations = 0;
const origins: string[] = [];
const dependencies: OnboardingDependencies = {
  authenticate: async (token) => token === "fixture-token" ? subject : undefined,
  principalStatus: async (identity) => identity === subject ? "owner" : undefined,
  connectionStatus: async () => connected,
  replace: async (identity, credentials) => {
    assert.equal(identity, subject);
    assert.deepEqual(credentials, { username: "fixture@example.test", password: "fixture-password" });
    replacements++; connected = true; return "connected";
  },
  revoke: async () => { revocations++; connected = false; },
  listPrincipals: async () => [], setPrincipalStatus: async () => { throw new Error("Not part of this smoke"); },
  consumeCsrf: (identity, csrf, expiry) => consumePortalCsrf(storage, identity, csrf, expiry),
};
const server = createServer(async (req, res) => {
  try {
    const localOrigin = `http://localhost:${(server.address() as AddressInfo).port}`;
    const path = new URL(req.url ?? "/", localOrigin).pathname;
    if (path === "/stats") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ connected, replacements, revocations, origins, realProviderCalls: 0 })); return;
    }
    if (!["/fixture-sign-in", "/connect"].includes(path)) { res.writeHead(404).end(); return; }
    const headers = new Headers();
    if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
    if (req.headers["content-type"]) headers.set("content-type", req.headers["content-type"]);
    if (req.headers.origin) headers.set("origin", req.headers.origin === localOrigin ? canonical : req.headers.origin);
    if (path === "/fixture-sign-in") {
      assert.equal(req.method, "GET"); headers.set("authorization", "Bearer fixture-token");
    }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    if (req.method === "POST") origins.push(req.headers.origin ?? "missing");
    const result = await handleOnboardingRequest(new Request(`${canonical}/connect`, {
      method: req.method, headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
    }), env, dependencies);
    res.statusCode = result.status;
    for (const [name, value] of result.headers) if (name !== "set-cookie") res.setHeader(name, value);
    if (result.headers.getSetCookie().length) res.setHeader("set-cookie", result.headers.getSetCookie());
    res.end(await result.text());
  } catch { res.writeHead(500).end("Fixture failed."); }
});
server.listen(0, "127.0.0.1", () => {
  console.log(`Open http://localhost:${(server.address() as AddressInfo).port}/fixture-sign-in`);
  console.log("Synthetic credentials only: fixture@example.test / fixture-password. Never enter real credentials.");
});
