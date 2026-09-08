/* global console, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(appRoot, "coverage/coverage.txt");

export function validateCoverageReport(report) {
  const start = report.indexOf("# start of coverage report");
  const end = report.indexOf("# end of coverage report");
  if (start < 0 || end <= start) throw new Error("Native coverage summary is missing or empty.");

  const summary = report.slice(start, end);
  if (!/^# all files\s+\|/m.test(summary)) throw new Error("Native coverage summary has no all-files row.");
  if (!/^# (?:src|release)\s+\|/m.test(summary)) {
    throw new Error("Native coverage summary has no production-source section.");
  }

  let section;
  const files = [];
  const reportedFiles = [];
  for (const line of summary.split("\n")) {
    const nextSection = line.match(/^# ([^ ].*?)\s+\|/);
    if (nextSection) section = nextSection[1];
    const file = line.match(/^# {2}(.+?\.(?:[cm]?[jt]sx?))\s+\|/);
    if (!file) continue;
    reportedFiles.push(file[1]);
    if (section === "src" || section === "release") files.push(file[1]);
  }
  if (files.length === 0) throw new Error("Native coverage summary has no eligible production-source entries.");
  if (reportedFiles.some((file) => /(?:^|\/)(?:dist|node_modules|generated)(?:\/|$)|\.generated\.|\.test\.|\.spec\./.test(file))) {
    throw new Error("Native coverage summary includes a test or generated source entry.");
  }
}

async function main() {
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec",
      "tsx",
      "--test",
      "--experimental-test-coverage",
      "--test-reporter=tap",
      "--test-coverage-include=src/**/*.ts",
      "--test-coverage-exclude=src/**/*.test.ts",
      "--test-coverage-exclude=src/**/generated/**",
      "--test-coverage-exclude=src/**/*.generated.ts",
      "--test-coverage-include=release/**/*.ts",
      "--test-coverage-include=scripts/production-acceptance.ts",
      "--test-coverage-exclude=release/**/*.test.ts",
      "--test-coverage-exclude=release/**/generated/**",
      "--test-coverage-exclude=release/**/*.generated.ts",
      "src/*.test.ts",
      "release/*.test.ts",
      "scripts/*.test.mjs",
    ],
    { cwd: appRoot, stdio: ["inherit", "pipe", "pipe"] },
  );

  let report = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      report += text;
      process.stdout.write(text);
    });
  }

  const code = await new Promise((resolveChild, rejectChild) => {
    child.once("error", rejectChild);
    child.once("close", resolveChild);
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report);
  if (code !== 0) process.exitCode = code ?? 1;
  validateCoverageReport(report);
  console.log("Coverage limitation: Node reports only production source files loaded by this test run; unloaded source files cannot be attributed.");
}

async function validateSavedReport() {
  let report;
  try {
    report = await readFile(reportPath, "utf8");
  } catch {
    throw new Error("Coverage artifact is missing.");
  }
  validateCoverageReport(report);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] === "--validate" ? validateSavedReport : main;
  command().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
