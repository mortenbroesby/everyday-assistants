import { readFileSync } from "node:fs";
import { NemligClient, NemligError, type ShoppingClient } from "./client.js";
import { getCredentials, type Credentials } from "./config.js";

let sharedClient: NemligClient | undefined;
const packageVersion = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown }).version;
if (typeof packageVersion !== "string") throw new Error("Nemlig package version is missing.");

export const NEMLIG_VERSION = packageVersion;

/** Lazily creates the process-local provider client without logging in or prompting. */
export const getClient = (): NemligClient => (sharedClient ??= new NemligClient());

/** Logs in through the supplied credential loader; server callers never receive a prompt dependency. */
export async function ensureLoggedIn(
  client: Pick<ShoppingClient, "isLoggedIn" | "login">,
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
): Promise<void> {
  if (client.isLoggedIn()) return;
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new NemligError("No Nemlig credentials configured. Run `pnpm nemlig login --save`.");
  }
  await client.login(credentials.username, credentials.password);
}
