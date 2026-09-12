import assert from "node:assert/strict";
import test from "node:test";
import { effectRemedaCandidate } from "./comparison/effect-remeda.js";
import { fpTsCandidate } from "./comparison/fp-ts.js";
import {
  expectedDisplayModel,
  runComparisonScenario,
  samplePayload,
  scenarios,
} from "./comparison/harness.js";

const candidates = [fpTsCandidate, effectRemedaCandidate] as const;

for (const candidate of candidates) {
  test(`${candidate.name} derives the shared plain display model`, () => {
    assert.deepEqual(candidate.derive(samplePayload), expectedDisplayModel);
  });

  for (const scenario of scenarios) {
    test(`${candidate.name} matches the ${scenario} lifecycle trace`, async () => {
      const result = await runComparisonScenario(candidate, scenario);
      assert.deepEqual(result.actual, result.expected);
    });
  }
}
