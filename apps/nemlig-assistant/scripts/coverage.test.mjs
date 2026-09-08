import assert from "node:assert/strict";
import test from "node:test";
import { validateCoverageReport } from "./coverage.mjs";

const report = `# start of coverage report
# -----------------------------------------------------------
# file       | line % | branch % | funcs % | uncovered lines
# -----------------------------------------------------------
# src        |        |          |         |
#  config.ts |  90.63 |    66.67 |   80.00 | 13-14
# -----------------------------------------------------------
# all files  |  90.63 |    66.67 |   80.00 |
# -----------------------------------------------------------
# end of coverage report`;

test("accepts a native summary with production source", () => {
  validateCoverageReport(report);
});

for (const [name, value, message] of [
  ["missing summary", "", /summary is missing or empty/],
  ["missing all-files row", report.replace("# all files", "# totals"), /all-files row/],
  ["missing production section", report.replace("# src", "# sources"), /production-source section/],
  ["missing production source", report.replace("#  config.ts |  90.63 |    66.67 |   80.00 | 13-14\n", ""), /eligible production-source/],
  ["test source", report.replace("config.ts", "config.test.ts"), /test or generated/],
  ["generated source", report.replace("config.ts", "generated/config.ts"), /test or generated/],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateCoverageReport(value), message);
  });
}
