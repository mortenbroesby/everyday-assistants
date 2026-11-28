import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parsePrincipalPolicy } from "../src/principal-policy.js";

const endpoint = "https://nemlig-staging.broesby.dk/mcp";
export function stagingSettings(env: NodeJS.ProcessEnv = process.env) {
  function required(name: string): string {
    const value = env[name]?.trim();
    if (!value) {
      throw new Error(`Missing staging setting ${name}`);
    }
    return value;
  }
  const issuer = new URL(required("STAGING_AUTH0_ISSUER"));
  if (
    issuer.protocol !== "https:" ||
    !issuer.hostname.endsWith(".auth0.com") ||
    issuer.hostname === "everyday-assistants.eu.auth0.com" ||
    issuer.href !== issuer.origin + "/"
  ) {
    throw new Error("Expected a separate development Auth0 tenant origin");
  }
  const clientId = required("STAGING_AUTH0_CLIENT_ID");
  const secret = required("STAGING_AUTH0_CLIENT_SECRET");
  const policy = required("STAGING_PRINCIPALS");
  const members = parsePrincipalPolicy(policy);
  if (
    !members.principals.some(
      (p) => p.enabled && p.subject === clientId + "@clients",
    ) ||
    members.owner_subject === clientId + "@clients"
  ) {
    throw new Error(
      "Staging requires an invited machine shopper and a separate human owner",
    );
  }
  const key = required("STAGING_CREDENTIAL_KEY");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(key)) {
    throw new Error("Invalid staging key");
  }
  return { issuer, clientId, secret, policy, key };
}

async function issueShopperToken({
  issuer,
  clientId,
  secret,
}: ReturnType<typeof stagingSettings>) {
  // Check the development grant before incurring deployment cost.
  const tokenResponse = await fetch(new URL("oauth/token", issuer), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      audience: endpoint,
      client_id: clientId,
      client_secret: secret,
      scope: "use:nemlig-assistant",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `Staging Auth0 grant failed (HTTP ${tokenResponse.status})`,
    );
  }
  const { access_token: token } = (await tokenResponse.json()) as {
    access_token?: string;
  };
  if (typeof token !== "string" || !token) {
    throw new Error("Staging grant returned no token");
  }
  return token;
}

async function deployWorker(
  revision: string,
  { issuer, policy, key }: ReturnType<typeof stagingSettings>,
) {
  const directory = await mkdtemp(join(tmpdir(), "nemlig-staging-"));
  try {
    const file = join(directory, "bindings.json");
    await writeFile(
      file,
      JSON.stringify({
        NEMLIG_MCP_PRINCIPALS: policy,
        NEMLIG_MCP_CREDENTIAL_KEY: key,
      }),
      { mode: 0o600 },
    );
    const config = JSON.parse(await readFile("wrangler.staging.json", "utf8"));
    config.main = resolve(config.main);
    config.assets.directory = resolve(config.assets.directory);
    const [container] = config.containers;
    container.image = resolve(container.image);
    container.image_build_context = resolve(container.image_build_context);
    container.image_vars.JOURNEY_IMAGE_REVISION = revision;
    const configPath = join(directory, "wrangler.json");
    await writeFile(configPath, JSON.stringify(config));
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        configPath,
        "--var",
        "NEMLIG_MCP_AUTH0_ISSUER:" + issuer.href,
        "--var",
        "NEMLIG_MCP_REVISION:" + revision,
        "--secrets-file",
        file,
      ],
      { stdio: "inherit" },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitForRevision(revision: string) {
  const health = new URL("/revision", endpoint);
  let ready = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(health, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      const result = (await response.json()) as { revision?: string };
      ready = response.ok && result.revision === revision;
    } catch {
      /* Route propagation is bounded below. */
    }
    if (ready) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!ready) {
    throw new Error("Staging health did not confirm the deployed revision");
  }
}

async function deploy() {
  const settings = stagingSettings();
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const token = await issueShopperToken(settings);
  await deployWorker(revision, settings);
  await waitForRevision(revision);
  execFileSync("pnpm", ["exec", "tsx", "scripts/journey-client.ts"], {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEMLIG_JOURNEY_EXPECTED_REVISION: revision,
      NEMLIG_JOURNEY_ENDPOINT: endpoint,
      NEMLIG_JOURNEY_TOKEN: token,
    },
  });
}
if (import.meta.main) {
  deploy().catch((error) => {
    // Child errors may include arguments; report only our own bounded messages.
    console.error(
      error instanceof Error && !("status" in error)
        ? error.message
        : "Staging deployment or acceptance failed",
    );
    process.exitCode = 1;
  });
}
