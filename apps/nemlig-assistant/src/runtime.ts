import { readFileSync } from "node:fs";
import { NemligClient, NemligError, type ShoppingClient } from "./client.js";
import { getCredentials, type Credentials } from "./config.js";

let sharedClient: NemligClient | undefined;
const packageVersion = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown }).version;
if (typeof packageVersion !== "string") throw new Error("Nemlig package version is missing.");

export const NEMLIG_VERSION = packageVersion;

/** Lazily creates the process-local provider client without logging in or prompting. */
export const getClient = (): NemligClient => (sharedClient ??= new NemligClient());

async function login(
  client: Pick<ShoppingClient, "login">,
  loadCredentials: () => Promise<Credentials | undefined>,
): Promise<void> {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new NemligError("No Nemlig credentials configured. Run `pnpm nemlig login --save`.");
  }
  await client.login(credentials.username, credentials.password);
}

/** Logs in through the supplied credential loader; server callers never receive a prompt dependency. */
export async function ensureLoggedIn(
  client: Pick<ShoppingClient, "isLoggedIn" | "login">,
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
): Promise<void> {
  if (client.isLoggedIn()) return;
  await login(client, loadCredentials);
}

export async function withAuthenticatedReadRetry<T>(
  client: Pick<ShoppingClient, "isLoggedIn" | "login">,
  loadCredentials: () => Promise<Credentials | undefined>,
  action: () => Promise<T>,
): Promise<T> {
  await ensureLoggedIn(client, loadCredentials);
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
