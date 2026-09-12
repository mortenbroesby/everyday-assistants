import { readFileSync } from "node:fs";
import { NemligClient, NemligError, type ShoppingClient } from "./client.js";
import { getCredentials, type Credentials } from "./config.js";
import { readPackageIdentity } from "./release-identity.js";

let sharedClient: NemligClient | undefined;
const loginInFlight = new WeakMap<object, Promise<void>>();
const packageIdentity = readPackageIdentity(readFileSync(new URL("../package.json", import.meta.url), "utf8"), "Nemlig package manifest");
if (packageIdentity.codename === null) throw new Error("Nemlig package codename is missing.");

export const NEMLIG_VERSION = packageIdentity.version;
export const NEMLIG_CODENAME = packageIdentity.codename;
export const NEMLIG_RELEASE_IDENTITY = `${NEMLIG_VERSION} - ${NEMLIG_CODENAME}`;

/** Lazily creates the process-local provider client without logging in or prompting. */
export const getClient = (): NemligClient => (sharedClient ??= new NemligClient());

async function login(
  client: Pick<ShoppingClient, "login">,
  loadCredentials: () => Promise<Credentials | undefined>,
): Promise<void> {
  const existing = loginInFlight.get(client);
  if (existing) return existing;
  const attempt = (async () => {
    const credentials = await loadCredentials();
    if (!credentials) {
      throw new NemligError("No Nemlig credentials configured. Run `pnpm nemlig login --save`.");
    }
    await client.login(credentials.username, credentials.password);
  })();
  loginInFlight.set(client, attempt);
  try {
    await attempt;
  } finally {
    if (loginInFlight.get(client) === attempt) loginInFlight.delete(client);
  }
}

/** Logs in through the supplied credential loader; server callers never receive a prompt dependency. */
export async function ensureLoggedIn(
  client: Pick<ShoppingClient, "isLoggedIn" | "login">,
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
  fresh = false,
): Promise<void> {
  if (!fresh && client.isLoggedIn()) return;
  await login(client, loadCredentials);
}

export async function withAuthenticatedReadRetry<T>(
  client: Pick<ShoppingClient, "isLoggedIn" | "login">,
  loadCredentials: () => Promise<Credentials | undefined>,
  action: () => Promise<T>,
  fresh = true,
): Promise<T> {
  await ensureLoggedIn(client, loadCredentials, fresh);
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof NemligError) || error.status !== 401) {
      throw error;
    }
    await login(client, loadCredentials);
    return await action();
  }
}
