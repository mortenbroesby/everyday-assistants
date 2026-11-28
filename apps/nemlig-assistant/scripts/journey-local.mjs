import { spawn, execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Buffer } from "node:buffer";
import console from "node:console";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { checkContainerEngine } from "../../../scripts/check-container-engine.mjs";
import { installJourneyIssuer } from "./journey-issuer.mjs";

const { AbortController, AbortSignal } = globalThis;
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let temp;
const children = new Set();
let engineReady = false;
let shuttingDown = false;
const runId = randomBytes(8).toString("hex");
const imageLabel = "dk.broesby.nemlig.journey";
const deadline = AbortSignal.timeout(30 * 60_000);
const stop = new AbortController();
const signal = AbortSignal.any([deadline, stop.signal]);
const abort = () => stop.abort();
const cleanEnv = { ...process.env };
for (const name of Object.keys(cleanEnv)) {
  if (
    name !== "WRANGLER_DOCKER_BIN" &&
    /^(?:NEMLIG_|MCP_|STAGING_|AUTH0_|CLOUDFLARE_|CF_API_|WRANGLER_|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED)/u.test(
      name,
    )
  ) {
    delete cleanEnv[name];
  }
}

function start(binary, args, options) {
  signal.throwIfAborted();
  const child = spawn(binary, args, {
    detached: true,
    cwd: app,
    env: cleanEnv,
    ...options,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function terminate(child, sig) {
  if (child.pid) {
    try {
      process.kill(-child.pid, sig);
    } catch (error) {
      if (error.code !== "ESRCH") {
        console.warn("Could not confirm journey process shutdown.");
      }
    }
  }
}

function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(async () => {
    const port = server.address().port;
    await new Promise((done) => server.close(done));
    return port;
  });
}

function health(endpoint, ca) {
  return new Promise((done) => {
    const req = httpsGet(
      new URL("/healthz", endpoint),
      { ca, signal, timeout: 1500 },
      (response) => {
        response.resume();
        done(response.statusCode === 200);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => done(false));
  });
}

/** Remove only image tags created for this invocation; Docker retains live references. */
export function cleanupJourneyImage(owner, env, execute = execFileSync) {
  const engine = env.WRANGLER_DOCKER_BIN || "docker";
  const options = {
    env,
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "ignore"],
  };
  const tags = execute(
    engine,
    [
      "image",
      "ls",
      "--filter",
      `label=${imageLabel}=${owner}`,
      "--format",
      "{{.Repository}}:{{.Tag}}",
    ],
    options,
  )
    .trim()
    .split(/\s+/u);
  for (const tag of tags) {
    if (/^cloudflare-dev\/localjourneycontainer:[a-f0-9]{8}$/u.test(tag)) {
      execute(engine, ["image", "rm", tag], options);
    }
  }
}

async function run() {
  if (!checkContainerEngine(cleanEnv)) {
    throw new Error("Container preflight failed");
  }
  engineReady = true;
  const port = await availablePort();
  const endpoint = `https://127.0.0.1:${port}/mcp`;
  const key = join(temp, "tls.key");
  const cert = join(temp, "tls.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { stdio: "ignore", timeout: 30_000 },
  );
  const ca = await readFile(cert);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const fixture = `(${installJourneyIssuer.toString()})(${JSON.stringify({ ...publicKey.export({ format: "jwk" }), kid: "journey", alg: "RS256" })});`;
  const preload =
    "data:text/javascript;base64," + Buffer.from(fixture).toString("base64");
  const workerFile = join(temp, "worker.mjs");
  const worker = JSON.stringify(join(app, "src/journey-worker.ts"));
  await writeFile(
    workerFile,
    `import { JourneyContainer } from ${worker};
export { default, ContainerProxy, OwnerLocalBasketStorage } from ${worker};
${fixture}
export class LocalJourneyContainer extends JourneyContainer {
  entrypoint = ["node", "--import", ${JSON.stringify(preload)}, "dist/journey-http.js"];
}
LocalJourneyContainer.outboundByHost = JourneyContainer.outboundByHost;
`,
  );
  const config = JSON.parse(
    await readFile(join(app, "wrangler.journey.json"), "utf8"),
  );
  delete config.$schema;
  // Concurrent invocations get different namespaces and cold instances.
  config.name = "nemlig-journey-" + runId;
  config.main = workerFile;
  config.assets.directory = resolve(app, config.assets.directory);
  const [container] = config.containers;
  container.class_name = "LocalJourneyContainer";
  // Keep the repository image instructions while using the local engine's bundled
  // Dockerfile frontend. This avoids a separate Docker Hub frontend process.
  const imageRecipe = await readFile(resolve(app, container.image), "utf8");
  container.image = join(temp, "Dockerfile");
  await writeFile(
    container.image,
    imageRecipe.replace(/^# syntax=docker\/dockerfile:1\r?\n/u, "") +
      `\nLABEL ${imageLabel}="${runId}"\n`,
  );
  container.image_build_context = resolve(app, container.image_build_context);
  config.durable_objects.bindings.find(
    (b) => b.name === "NEMLIG_MCP_CONTAINER",
  ).class_name = "LocalJourneyContainer";
  config.migrations = [
    {
      tag: "v1",
      new_sqlite_classes: ["LocalJourneyContainer", "OwnerLocalBasketStorage"],
    },
  ];
  const subject = "auth0|synthetic-journey";
  const issuer = "https://journey-issuer.invalid/";
  Object.assign(config.vars, {
    NEMLIG_MCP_REVISION: "local",
    NEMLIG_MCP_AUTH0_ISSUER: issuer,
    NEMLIG_MCP_AUTH0_AUDIENCE: endpoint,
    NEMLIG_MCP_PUBLIC_URL: endpoint,
    NEMLIG_MCP_CREDENTIAL_KEY: randomBytes(32).toString("base64url"),
    NEMLIG_MCP_PRINCIPALS: JSON.stringify({
      schema_version: 3,
      revision: "journey",
      owner_subject: subject,
      principals: [
        {
          subject,
          principal_key: randomBytes(32).toString("base64url"),
          enabled: true,
        },
      ],
    }),
  });
  const configFile = join(temp, "wrangler.json");
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  console.log("Starting local Wrangler and Docker");
  const wrangler = start(
    process.execPath,
    [
      join(app, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--local",
      "--config",
      configFile,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      join(temp, "state"),
      "--local-protocol",
      "https",
      "--https-key-path",
      key,
      "--https-cert-path",
      cert,
      "--show-interactive-dev-session=false",
    ],
    {
      cwd: temp,
      env: {
        ...cleanEnv,
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_LOG_PATH: join(temp, "wrangler.log"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = once(wrangler, "exit").then(([code, exitSignal]) => {
    if (!shuttingDown && !signal.aborted) {
      console.error(
        "Wrangler exited",
        JSON.stringify({ code, signal: exitSignal }),
      );
    }
    throw new Error("Wrangler exited before journey completion");
  });
  // Install an early handler while polling, including during cleanup.
  exited.catch(() => {});
  for (const stream of [wrangler.stdout, wrangler.stderr]) {
    stream.on("data", (chunk) => {
      for (const hint of [
        "Cannot connect to the Docker daemon",
        "Too Many Requests",
        "Could not resolve",
        "no space left on device",
        "Failed to build",
        "frontend grpc server closed unexpectedly",
        "Docker build exited with code",
        "Preparing container image",
        "failed to solve",
        "failed to fetch",
        "connection reset",
        "connection refused",
        "failed to read",
        "context deadline exceeded",
        "context canceled",
        "i/o timeout",
        "permission denied",
        "failed to dial",
        "out of memory",
        "EOF",
        "Unknown arguments",
        "Build failed",
        "Ready on",
        "Failed to start",
        "Starting local server",
        "Building image",
      ]) {
        if (chunk.toString().includes(hint)) {
          console.log("Wrangler:", hint);
        }
      }
    });
  }
  while (!(await health(endpoint, ca))) {
    await Promise.race([delay(500, undefined, { signal }), exited]);
  }
  const token = await new SignJWT({
    scope: "use:nemlig-assistant",
    azp: "journey-client",
  })
    .setProtectedHeader({ alg: "RS256", kid: "journey" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(endpoint)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  const client = start(
    process.execPath,
    ["--import", "tsx", join(app, "scripts/journey-client.ts")],
    {
      stdio: "inherit",
      env: {
        ...cleanEnv,
        NODE_EXTRA_CA_CERTS: cert,
        NEMLIG_JOURNEY_TOKEN: token,
        NEMLIG_JOURNEY_ENDPOINT: endpoint,
      },
    },
  );
  const [code] = await Promise.race([once(client, "exit", { signal }), exited]);
  if (code !== 0) {
    throw new Error("Local MCP journey failed");
  }
}

if (import.meta.main) {
  temp = await mkdtemp(join(tmpdir(), "nemlig-journey-"));
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    await run();
  } catch (error) {
    console.error(
      [
        "Container preflight failed",
        "Local MCP journey failed",
        "Wrangler exited before journey completion",
      ].includes(error.message)
        ? error.message
        : "Local journey setup failed",
    );
    process.exitCode = 1;
  } finally {
    shuttingDown = true;
    const active = [...children];
    const exits = active.map((child) => once(child, "exit").catch(() => {}));
    for (const child of active) {
      terminate(child, "SIGTERM");
    }
    if (active.length) {
      await Promise.race([
        Promise.all(exits),
        delay(15_000, undefined, { ref: false }),
      ]);
      for (const child of children) {
        terminate(child, "SIGKILL");
      }
      await Promise.all(exits);
    }
    if (engineReady) {
      try {
        cleanupJourneyImage(runId, cleanEnv);
      } catch {
        console.warn(
          "Docker kept the local journey image or could not confirm cleanup.",
        );
      }
    }
    await rm(temp, { recursive: true, force: true });
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}
