import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, posix, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ARTIFACT_KEYS = new Set([
  "id",
  "kind",
  "path",
  "scope",
  "summary",
  "skillName",
  "dependsOn",
  "readBefore",
]);
const ARTIFACT_KINDS = new Set([
  "collection",
  "configuration",
  "index",
  "instruction",
  "manifest",
  "skill",
  "template",
  "validator",
  "workflow",
]);
const ROUTE_KEYS = new Set(["id", "intent", "scope", "use", "readBefore"]);

export function validateManifest(manifest, { root = resolve(import.meta.dirname, ".."), trackedPaths } = {}) {
  const errors = [];
  if (!isRecord(manifest)) return ["manifest must be an object"];

  exactKeys(manifest, new Set(["schemaVersion", "metadata", "artifacts", "routes"]), "manifest", errors);
  if (manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must equal 1");
  validateMetadata(manifest.metadata, errors);
  if (!Array.isArray(manifest.artifacts)) errors.push("manifest.artifacts must be an array");
  if (!Array.isArray(manifest.routes)) errors.push("manifest.routes must be an array");

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const routes = Array.isArray(manifest.routes) ? manifest.routes : [];
  const ids = new Set();
  const paths = new Set();
  const byId = new Map();
  const managed = trackedPaths ? new Set(trackedPaths.map(toPosix)) : undefined;

  artifacts.forEach((artifact, index) => {
    const label = `artifacts[${index}]`;
    if (!isRecord(artifact)) {
      errors.push(`${label} must be an object`);
      return;
    }
    exactKeys(artifact, ARTIFACT_KEYS, label, errors);
    requiredString(artifact.id, `${label}.id`, errors);
    requiredString(artifact.path, `${label}.path`, errors);
    requiredString(artifact.scope, `${label}.scope`, errors);
    requiredString(artifact.summary, `${label}.summary`, errors);
    if (!ARTIFACT_KINDS.has(artifact.kind)) errors.push(`${label}.kind is not supported`);
    optionalStringArray(artifact.dependsOn, `${label}.dependsOn`, errors);
    optionalStringArray(artifact.readBefore, `${label}.readBefore`, errors);

    if (typeof artifact.id === "string") {
      if (ids.has(artifact.id)) errors.push(`duplicate artifact id "${artifact.id}"`);
      ids.add(artifact.id);
      byId.set(artifact.id, artifact);
    }
    if (typeof artifact.path === "string") {
      if (paths.has(artifact.path)) errors.push(`duplicate artifact path "${artifact.path}"`);
      paths.add(artifact.path);
      if (!isSafePath(artifact.path)) {
        errors.push(`${label}.path must be a safe repository-relative path`);
      } else {
        const absolute = resolve(root, artifact.path);
        if (!isInside(root, absolute)) errors.push(`${label}.path must stay inside the repository`);
        if (!existsSync(absolute)) {
          errors.push(`${artifact.path}: artifact path does not exist`);
        } else if (managed && !isManaged(artifact.path, absolute, managed)) {
          errors.push(`${artifact.path}: artifact path is not tracked or pending addition`);
        }
      }
    }
    if (artifact.kind === "skill" && typeof artifact.path === "string" && isSafePath(artifact.path)) {
      validateSkill(artifact, resolve(root, artifact.path), errors);
    } else if (artifact.skillName !== undefined) {
      errors.push(`${label}.skillName is only valid for skill artifacts`);
    }
  });

  const routeIds = new Set();
  routes.forEach((route, index) => {
    const label = `routes[${index}]`;
    if (!isRecord(route)) {
      errors.push(`${label} must be an object`);
      return;
    }
    exactKeys(route, ROUTE_KEYS, label, errors);
    requiredString(route.id, `${label}.id`, errors);
    requiredString(route.intent, `${label}.intent`, errors);
    requiredString(route.scope, `${label}.scope`, errors);
    requiredStringArray(route.use, `${label}.use`, errors);
    optionalStringArray(route.readBefore, `${label}.readBefore`, errors);
    if (typeof route.id === "string") {
      if (routeIds.has(route.id)) errors.push(`duplicate route id "${route.id}"`);
      routeIds.add(route.id);
    }
    for (const ref of [...(Array.isArray(route.use) ? route.use : []), ...(Array.isArray(route.readBefore) ? route.readBefore : [])]) {
      if (!byId.has(ref)) {
        errors.push(`${label} references unknown artifact "${ref}"`);
      } else if (!scopeAllows(route.scope, byId.get(ref).scope)) {
        errors.push(`${label} cannot use "${ref}" from scope "${byId.get(ref).scope}"`);
      }
    }
  });

  for (const artifact of artifacts.filter(isRecord)) {
    for (const field of ["dependsOn", "readBefore"]) {
      for (const ref of Array.isArray(artifact[field]) ? artifact[field] : []) {
        if (!byId.has(ref)) errors.push(`artifact "${artifact.id}" references unknown artifact "${ref}" in ${field}`);
      }
    }
  }
  const cycle = findReferenceCycle(artifacts, byId);
  if (cycle) errors.push(`artifact reference cycle: ${cycle.join(" -> ")}`);

  for (const discovered of discoverAgentArtifactPaths(root)) {
    if (!paths.has(discovered)) errors.push(`unlisted agent artifact: ${discovered}`);
  }

  return errors;
}

export function discoverAgentArtifactPaths(root) {
  if (!existsSync(root)) return [];
  return walk(root)
    .map((absolute) => toPosix(absolute.slice(root.length + 1)))
    .filter((path) =>
      /(^|\/)(?:AGENTS|CLAUDE)\.md$/.test(path) ||
      /^\.agents\/instructions\/.*\.md$/.test(path) ||
      /^\.agents\/skills\/.*\/SKILL\.md$/.test(path) ||
      /^apps\/.*\/\.codex\/skills\/.*\/SKILL\.md$/.test(path),
    )
    .sort();
}

function validateMetadata(metadata, errors) {
  if (!isRecord(metadata)) {
    errors.push("manifest.metadata must be an object");
    return;
  }
  exactKeys(metadata, new Set(["purpose", "authority"]), "metadata", errors);
  requiredString(metadata.purpose, "metadata.purpose", errors);
  requiredString(metadata.authority, "metadata.authority", errors);
  if (typeof metadata.authority === "string" &&
      !(/discover/i.test(metadata.authority) && /does not override guidance or authorize action/i.test(metadata.authority))) {
    errors.push("metadata.authority must say the manifest discovers but does not override guidance or authorize action");
  }
}

function validateSkill(artifact, absolute, errors) {
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return;
  const text = readFileSync(absolute, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) {
    errors.push(`${artifact.path}: skill must have YAML frontmatter`);
    return;
  }
  const name = scalar(frontmatter, "name");
  const description = scalar(frontmatter, "description");
  if (!name) errors.push(`${artifact.path}: skill frontmatter name must be nonempty`);
  if (!description) errors.push(`${artifact.path}: skill frontmatter description must be nonempty`);
  if (artifact.skillName !== undefined && artifact.skillName !== name) {
    errors.push(`${artifact.path}: declared skillName "${artifact.skillName}" does not match "${name}"`);
  }
}

function scalar(frontmatter, key) {
  const raw = frontmatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"))?.[1]?.trim();
  return raw?.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2").trim();
}

function findReferenceCycle(artifacts, byId) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visiting.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (visited.has(id)) return undefined;
    visiting.add(id);
    stack.push(id);
    const artifact = byId.get(id);
    for (const ref of [...(artifact?.dependsOn ?? []), ...(artifact?.readBefore ?? [])]) {
      if (!byId.has(ref)) continue;
      const cycle = visit(ref);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  }
  for (const artifact of artifacts.filter(isRecord)) {
    const cycle = visit(artifact.id);
    if (cycle) return cycle;
  }
  return undefined;
}

function scopeAllows(routeScope, artifactScope) {
  return typeof routeScope !== "string" || typeof artifactScope !== "string" ||
    artifactScope === "repository" || routeScope === artifactScope;
}

function exactKeys(value, allowed, label, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} has unexpected key "${key}"`);
  }
  for (const key of allowed) {
    if (["skillName", "dependsOn", "readBefore"].includes(key)) continue;
    if (!(key in value)) errors.push(`${label} is missing key "${key}"`);
  }
}

function requiredString(value, label, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label} must be a nonempty string`);
}

function requiredStringArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item)) {
    errors.push(`${label} must be a nonempty string array`);
  }
}

function optionalStringArray(value, label, errors) {
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item))) {
    errors.push(`${label} must be a string array`);
  }
}

function isSafePath(path) {
  return typeof path === "string" && path.length > 0 && !isAbsolute(path) && !path.includes("\\") &&
    path === posix.normalize(path) && path !== ".." && !path.startsWith("../");
}

function isInside(root, absolute) {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return absolute === root || absolute.startsWith(prefix);
}

function isManaged(path, absolute, managed) {
  if (statSync(absolute).isDirectory()) return [...managed].some((entry) => entry.startsWith(`${path}/`));
  return managed.has(path);
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile() || (entry.isSymbolicLink() && isFileLink(absolute))) files.push(absolute);
  }
  return files;
}

function isFileLink(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const root = resolve(import.meta.dirname, "..");
  const manifestPath = resolve(root, ".agents/manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`Cannot read .agents/manifest.json: ${error.message}`);
    process.exit(1);
  }
  const trackedPaths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  const errors = validateManifest(manifest, { root, trackedPaths });
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Agent-artifact manifest check passed (${manifest.artifacts.length} artifacts, ${manifest.routes.length} routes).`);
}
