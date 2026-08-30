import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const explicit = process.argv.slice(2).map((path) => resolve(path));
const files = (explicit.length
  ? explicit.flatMap(walk)
  : execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean)
      .map((path) => resolve(root, path)))
  .filter(existsSync);
const forbiddenPaths = [
  /(^|\/)\.auth\//,
  /(^|\/)audit\//,
  /(^|\/)apps\/(?:gmail-cleanup|drive-cleanup-assistant)\//,
  /(?:credentials?|tokens?|cookies?)\.json$/i,
];
const forbiddenContent = [
  /\/(?:Users|home)\/[^/\s]+\//,
  /\b[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|icloud)\.com\b/i,
  new RegExp(["mortenbroesby", "personal-assistant"].join("/"), "i"),
  /apps\/nemlig-food-assistant/i,
  /apps\/(?:gmail-cleanup|drive-cleanup-assistant)/i,
  ...process.env.PUBLIC_RELEASE_DENYLIST?.split("\n")
    .filter(Boolean)
    .map((value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) ?? [],
];
const findings = [];

for (const file of files) {
  const relative = file.startsWith(root) ? file.slice(root.length + 1) : file;
  if (forbiddenPaths.some((pattern) => pattern.test(relative))) {
    findings.push(`${relative}: forbidden tracked path`);
  }
  const contents = readFileSync(file, "utf8");
  if (contents.includes("\0")) continue;
  for (const pattern of forbiddenContent) {
    if (pattern.test(contents)) findings.push(`${relative}: forbidden content (${pattern.source})`);
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Public-tree check passed (${files.length} files).`);
}

function walk(path) {
  return statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => walk(resolve(path, name)))
    : [path];
}
