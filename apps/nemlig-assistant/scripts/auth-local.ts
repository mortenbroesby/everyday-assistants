import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const varsPath = resolve(root, ".dev.vars");
const run = (command: string, args: string[]): string => execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const vars = (): Map<string, string> => new Map(readFileSync(varsPath, "utf8").split(/\r?\n/u).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)] as const;
}));
const required = (values: Map<string, string>, name: string): string => {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`${name} is missing from apps/nemlig-assistant/.dev.vars`);
  return value;
};
const assertLocal = (values: Map<string, string>): void => {
  if (required(values, "MCP_ENABLED") !== "true") throw new Error("MCP_ENABLED must be true for the local proof only.");
  const publicUrl = new URL(required(values, "NEMLIG_MCP_PUBLIC_URL"));
  if (publicUrl.protocol !== "https:" || !["127.0.0.1", "localhost"].includes(publicUrl.hostname) || publicUrl.pathname !== "/mcp") {
    throw new Error("NEMLIG_MCP_PUBLIC_URL must be an HTTPS loopback /mcp URL.");
  }
  if (required(values, "NEMLIG_MCP_AUTH0_AUDIENCE") !== publicUrl.href) throw new Error("The local Auth0 API audience must equal the local MCP resource URL.");
  if (required(values, "NEMLIG_MCP_AUTH0_ISSUER").startsWith("https://YOUR-")) throw new Error("Replace the development Auth0 issuer placeholder.");
  if (required(values, "NEMLIG_MCP_PRINCIPALS").includes("YOUR-DEV-SUBJECT")) throw new Error("Replace the development principal subject placeholder.");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(required(values, "NEMLIG_MCP_CREDENTIAL_KEY"))) throw new Error("NEMLIG_MCP_CREDENTIAL_KEY must be a 32-byte base64url value.");
}

const doctor = (): void => {
  if (!existsSync(varsPath)) throw new Error("Copy .dev.vars.example to .dev.vars and fill only development values.");
  const values = vars();
  assertLocal(values);
  const colima = run("colima", ["list"]);
  const context = run("docker", ["context", "show"]);
  const docker = run("docker", ["version", "--format", "{{.Server.Os}}/{{.Server.Arch}} {{.Server.Version}}"]);
  if (context !== "colima") throw new Error(`Docker context is ${context}, expected the active Colima context.`);
  console.log(JSON.stringify({ node: process.version, wrangler: run("pnpm", ["exec", "wrangler", "--version"]), colima, docker }, null, 2));
};

const testLocal = async (): Promise<void> => {
  if (!existsSync(varsPath)) throw new Error("apps/nemlig-assistant/.dev.vars is required.");
  const values = vars();
  assertLocal(values);
  const base = new URL(required(values, "NEMLIG_MCP_PUBLIC_URL").replace(/\/mcp$/u, ""));
  const health = await fetch(new URL("/healthz", base));
  const metadata = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base));
  const anonymous = await fetch(new URL("/mcp", base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  if (health.status !== 200 || metadata.status !== 200 || anonymous.status !== 401) throw new Error(`Local calibration failed: health=${health.status} metadata=${metadata.status} anonymous=${anonymous.status}`);
  console.log(JSON.stringify({ health: health.status, metadata: metadata.status, anonymous: anonymous.status, authenticated: "run the pinned OAuth client proof separately" }));
};

if (process.argv[2] === "doctor") doctor();
else if (process.argv[2] === "test") await testLocal();
else throw new Error("Usage: auth-local.ts doctor|test");
