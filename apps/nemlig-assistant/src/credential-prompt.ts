import passwordPrompt from "@inquirer/password";
import { createInterface } from "node:readline/promises";
import { credentialsSchema, type Credentials } from "./config.js";

export async function promptCredentials(
  username?: string,
): Promise<Credentials> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "No Nemlig credentials configured. Run `pnpm nemlig login --save` in a terminal.",
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const email =
      username?.trim() || (await readline.question("Email: ")).trim();
    const password = await passwordPrompt({ message: "Password", mask: "*" });
    return credentialsSchema.parse({ username: email, password });
  } finally {
    readline.close();
  }
}
