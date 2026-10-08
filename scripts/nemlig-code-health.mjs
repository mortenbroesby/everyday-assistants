import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const baselinePath = resolve(root, ".code-health/nemlig-assistant-baseline.json");
const configPath = resolve(root, "knip.jsonc");
const knip = resolve(root, "node_modules/knip/bin/knip.js");
const categories = ["files", "dependencies", "exports", "types"];

const idFor = (category, file, name) => createHash("sha256").update(`${category}\0${file}\0${name}`).digest("hex");

export function findingsFrom(report) {
  const findings = [];
  for (const issue of report.issues ?? []) {
    const file = issue.file;
    if (typeof file !== "string" || !file.startsWith("apps/nemlig-assistant/")) throw new Error("Knip returned a finding outside Nemlig Assistant.");
    for (const category of categories) {
      for (const value of issue[category] ?? []) {
        const name = typeof value === "string" ? value : value?.name;
        if (typeof name !== "string" || !name) throw new Error(`Knip returned an invalid ${category} finding.`);
        findings.push({ category, file, id: idFor(category, file, name) });
      }
    }
  }
  return findings.sort((left, right) => left.id.localeCompare(right.id));
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
  const stdout = execFileSync(process.execPath, [knip, "--config", configPath, "--workspace", "nemlig-assistant", "--include", categories.join(","), "--reporter", "json", "--no-progress", "--no-exit-code"], { cwd: root, encoding: "utf8" });
  return findingsFrom(JSON.parse(stdout));
}

function snapshot(findings) {
  return { schemaVersion: 1, tool: { name: "knip", version: "6.40.0" }, generatedFrom: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), findings };
}

function summary(result) {
  return JSON.stringify({ known: result.known.length, new: result.new.length, resolved: result.resolved.length, newFindings: result.new }, null, 2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "baseline") {
    mkdirSync(resolve(root, ".code-health"), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(snapshot(scan()), null, 2)}\n`);
    console.log(`Wrote ${baselinePath}`);
  } else if (mode === "check") {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (baseline.schemaVersion !== 1 || baseline.tool?.name !== "knip" || baseline.tool?.version !== "6.40.0" || !Array.isArray(baseline.findings)) throw new Error("Code-health baseline is malformed or incompatible.");
    const result = compareFindings(baseline.findings, scan());
    console.log(summary(result));
    if (result.new.length) process.exitCode = 1;
  } else {
    throw new Error("Usage: nemlig-code-health.mjs <baseline|check>");
  }
}
