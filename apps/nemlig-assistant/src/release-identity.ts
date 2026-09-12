export function parseCodename(codename: string): string {
  if (!/^[A-Z][a-z]{1,23}$/u.test(codename) || codename.trim() !== codename) {
    throw new Error(`Invalid Nemlig release codename "${codename}".`);
  }
  return codename;
}

export interface PackageIdentity {
  version: string;
  codename: string | null;
}

/** Missing metadata is a historical baseline; present metadata must identify a valid codename. */
export function readPackageIdentity(contents: string, label: string): PackageIdentity {
  const manifest = JSON.parse(contents) as { version?: unknown; nemligRelease?: { codename?: unknown } };
  if (typeof manifest?.version !== "string" || !manifest.version) throw new Error(`${label} is missing a version string.`);
  if (!("nemligRelease" in manifest)) return { version: manifest.version, codename: null };
  const codename = manifest.nemligRelease?.codename;
  if (typeof codename !== "string") throw new Error(`${label} is missing a release codename string.`);
  parseCodename(codename);
  return { version: manifest.version, codename };
}
