const codenames = "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu".split(" ");

export function parseCodename(codename: string): { word: string; cycle: bigint } {
  const match = /^([A-Za-z]+)(?:-([1-9][0-9]*))?$/u.exec(codename);
  const cycle = BigInt(match?.[2] ?? "1");
  if (!match || match[0] !== codename || !codenames.includes(match[1]!) || (match[2] && cycle < 2n)) {
    throw new Error(`Invalid Nemlig release codename "${codename}".`);
  }
  return { word: match[1]!, cycle };
}

export function nextCodename(current: string | null): string {
  if (current === null) return codenames[0]!;
  const { word, cycle } = parseCodename(current);
  const index = codenames.indexOf(word) + 1;
  const nextCycle = cycle + (index === codenames.length ? 1n : 0n);
  return `${codenames[index % codenames.length]}${nextCycle === 1n ? "" : `-${nextCycle}`}`;
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
