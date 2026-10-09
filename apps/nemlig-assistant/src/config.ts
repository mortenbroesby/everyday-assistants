import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export const credentialsFile = (): string =>
  process.env.NEMLIG_CONFIG_DIR
    ? join(process.env.NEMLIG_CONFIG_DIR, "credentials.json")
    : join(homedir(), ".nemlig-shopper", "credentials.json");

export async function getCredentials(
  file = credentialsFile(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<Credentials | undefined> {
  const fromEnvironment = credentialsSchema.safeParse({
    username: env.NEMLIG_USERNAME,
    password: env.NEMLIG_PASSWORD,
  });
  if (fromEnvironment.success) {
    return fromEnvironment.data;
  }

  try {
    const saved = credentialsSchema.safeParse(
      JSON.parse(await readFile(file, "utf8")),
    );
    return saved.success ? saved.data : undefined;
  } catch {
    return undefined;
  }
}

export async function saveCredentials(
  credentials: Credentials,
  file = credentialsFile(),
): Promise<void> {
  const valid = credentialsSchema.parse(credentials);
  const directory = dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(file, `${JSON.stringify(valid)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function clearCredentials(
  file = credentialsFile(),
): Promise<void> {
  await rm(file, { force: true });
}
