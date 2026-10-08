import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const baselinePath = resolve(root, ".code-health/nemlig-assistant-baseline.json");
const knip = resolve(root, "node_modules/knip/bin/knip.js");
const categories = ["files", "dependencies", "exports", "types"];

const idFor = (category, file, name) => createHash("sha256").update(`${category}\0${file}\0${name}`).digest("hex");

export function findingsFrom(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.issues)) throw new Error("Knip returned an incompatible report.");
  const findings = [];
  for (const issue of report.issues) {
    if (!issue || typeof issue !== "object") throw new Error("Knip returned an invalid issue.");
    const file = issue.file;
    if (typeof file !== "string" || !file.startsWith("apps/nemlig-assistant/")) throw new Error("Knip returned a finding outside Nemlig Assistant.");
    for (const category of categories) {
      const values = issue[category] ?? [];
      if (!Array.isArray(values)) throw new Error(`Knip returned an invalid ${category} collection.`);
      for (const value of values) {
        const name = typeof value === "string" ? value : value?.name;
        if (typeof name !== "string" || !name) throw new Error(`Knip returned an invalid ${category} finding.`);
        findings.push({ category, file, id: idFor(category, file, name) });
      }
    }
  }
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function validateBaseline(baseline) {
  if (!baseline || typeof baseline !== "object" || baseline.schemaVersion !== 1 || baseline.tool?.name !== "knip" || baseline.tool?.version !== "6.40.0" || !/^[a-f0-9]{40}$/u.test(baseline.generatedFrom) || !Array.isArray(baseline.findings)) {
    throw new Error("Code-health baseline is malformed or incompatible.");
  }
  const ids = new Set();
  for (const finding of baseline.findings) {
    if (!finding || typeof finding !== "object" || !categories.includes(finding.category) || typeof finding.file !== "string" || !finding.file.startsWith("apps/nemlig-assistant/") || !/^[a-f0-9]{64}$/u.test(finding.id) || ids.has(finding.id)) {
      throw new Error("Code-health baseline contains an invalid finding.");
    }
    ids.add(finding.id);
  }
  return baseline;
}

export function compareFindings(baseline, current) {
  const before = new Map(baseline.map((finding) => [finding.id, finding]));
  const after = new Map(current.map((finding) => [finding.id, finding]));
  return {
    known: current.filter((finding) => before.has(finding.id)),
    new: current.filter((finding) => !before.has(finding.id)),
    resolved: baseline.filter((finding) => !after.has(finding.id)),
  };
}

function scan() {
  const stdout = execFileSync(process.execPath, [knip, "--workspace", "nemlig-assistant", "--include", categories.join(","), "--reporter", "json", "--no-progress", "--no-exit-code"], { cwd: root, encoding: "utf8" });
  return findingsFrom(JSON.parse(stdout));
}

function snapshot(findings, bootstrap) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const main = execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim();
  const mergeBase = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8" }).trim();
  let appChanges = false;
  try {
    execFileSync("git", ["diff", "--quiet", "origin/main...HEAD", "--", "apps/nemlig-assistant"], { cwd: root });
  } catch {
    appChanges = true;
  }
  if (head !== main && (!bootstrap || mergeBase !== main || appChanges)) {
    throw new Error("Code-health baselines may only be generated from origin/main, or with --bootstrap from a branch whose app source matches origin/main.");
  }
  return { schemaVersion: 1, tool: { name: "knip", version: "6.40.0" }, generatedFrom: main, findings };
}

function summary(result) {
  return JSON.stringify({ known: result.known.length, new: result.new.length, resolved: result.resolved.length, newFindings: result.new }, null, 2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode = arguments_[0];
  const baselineArgument = arguments_[1] === "--baseline" ? arguments_[2] : undefined;
  if (mode === "baseline") {
    const bootstrap = arguments_[1] === "--bootstrap";
    if (arguments_.length !== (bootstrap ? 2 : 1)) throw new Error("Usage: nemlig-code-health.mjs baseline [--bootstrap]");
    mkdirSync(resolve(root, ".code-health"), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(snapshot(scan(), bootstrap), null, 2)}\n`);
    console.log(`Wrote ${baselinePath}`);
  } else if (mode === "check") {
    if (arguments_.length !== (baselineArgument ? 3 : 1)) throw new Error("Usage: nemlig-code-health.mjs check [--baseline <path>]");
    const baseline = validateBaseline(JSON.parse(readFileSync(baselineArgument ?? baselinePath, "utf8")));
    const result = compareFindings(baseline.findings, scan());
    console.log(summary(result));
    if (result.new.length) process.exitCode = 1;
  } else {
    throw new Error("Usage: nemlig-code-health.mjs <baseline|check>");
  }
}
