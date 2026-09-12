import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { effectRemedaCandidate } from "../src/picker/comparison/effect-remeda.js";
import { fpTsCandidate } from "../src/picker/comparison/fp-ts.js";
import {
  expectedDisplayModel,
  runComparisonScenario,
  samplePayload,
  scenarios,
} from "../src/picker/comparison/harness.js";
import type { ComparisonCandidate } from "../src/picker/comparison/types.js";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = path.join(appRoot, ".comparison");
const candidates = [fpTsCandidate, effectRemedaCandidate] as const;
const repetitions = { build: 3, scenario: 25, typecheck: 5 } as const;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const run = (args: readonly string[]): number => {
  const started = performance.now();
  execFileSync("pnpm", args, { cwd: appRoot, encoding: "utf8", stdio: "pipe" });
  return performance.now() - started;
};

const findJavaScript = async (directory: string): Promise<string> => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findJavaScript(candidate).catch(() => undefined);
      if (nested) return nested;
    } else if (entry.name.endsWith(".js")) {
      return candidate;
    }
  }
  throw new Error(`No JavaScript artifact found in ${directory}`);
};

const measureCandidate = async (candidate: ComparisonCandidate) => {
  assert.deepEqual(candidate.derive(samplePayload), expectedDisplayModel);
  for (const scenario of scenarios) {
    const result = await runComparisonScenario(candidate, scenario);
    assert.deepEqual(result.actual, result.expected);
  }

  const scenarioTimes: number[] = [];
  for (let index = 0; index < repetitions.scenario; index += 1) {
    const started = performance.now();
    await runComparisonScenario(candidate, "success");
    scenarioTimes.push(performance.now() - started);
  }

  const buildTimes = Array.from({ length: repetitions.build }, () => run([
    "exec", "vite", "build", "--config", "vite.comparison.config.ts", "--mode", candidate.id,
  ]));
  const typecheckTimes = Array.from({ length: repetitions.typecheck }, () => run([
    "exec", "tsc", "-p", `tsconfig.comparison.${candidate.id}.json`, "--noEmit", "--extendedDiagnostics",
  ]));
  const artifactPath = await findJavaScript(path.join(outputRoot, candidate.id));
  const artifact = await readFile(artifactPath);
  const sourcePath = path.join(appRoot, "src/picker/comparison", `${candidate.id}.ts`);
  const source = await readFile(sourcePath, "utf8");

  return {
    id: candidate.id,
    name: candidate.name,
    behaviorCasesPassed: scenarios.length + 1,
    bundle: {
      gzipBytes: gzipSync(artifact).byteLength,
      rawBytes: artifact.byteLength,
    },
    buildMedianMs: Number(median(buildTimes).toFixed(2)),
    directPackages: candidate.id === "fp-ts" ? ["fp-ts"] : ["effect", "remeda"],
    physicalSourceLines: source.split("\n").length,
    scenarioMedianMs: Number(median(scenarioTimes).toFixed(4)),
    typecheckMedianMs: Number(median(typecheckTimes).toFixed(2)),
  };
};

await mkdir(outputRoot, { recursive: true });
const results = [];
for (const candidate of candidates) results.push(await measureCandidate(candidate));

const report = {
  environment: {
    architecture: process.arch,
    node: process.version,
    platform: process.platform,
    typescript: "5.9.3",
  },
  repetitions,
  results,
};

await writeFile(path.join(outputRoot, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
