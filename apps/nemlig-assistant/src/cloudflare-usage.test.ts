import assert from "node:assert/strict";
import test from "node:test";
import { admitUsage, emptyUsageState, resetUsage, type AdmissionLimits } from "./cloudflare-usage.js";

const limits: AdmissionLimits = { dailyLimit: 2, expensiveDailyLimit: 1, rateLimit: 1, expensiveRateLimit: 1 };
const at = (value: string) => new Date(value);

test("usage admission bounds rates and atomically trips persistent daily breakers", () => {
  let state = emptyUsageState(at("2026-08-31T12:00:00Z"));
  const normal = admitUsage(state, "normal", limits, at("2026-08-31T12:00:01Z"));
  assert.equal(normal.admitted, true);
  state = normal.state;
  assert.deepEqual(admitUsage(state, "normal", limits, at("2026-08-31T12:00:02Z")), {
    admitted: false, status: 429, reason: "rate_limit", state,
  });
  const expensive = admitUsage(state, "expensive", limits, at("2026-08-31T12:01:00Z"));
  assert.equal(expensive.admitted, true);
  state = expensive.state;
  const tripped = admitUsage(state, "normal", limits, at("2026-08-31T12:01:01Z"));
  assert.equal(tripped.admitted, false);
  assert.equal(tripped.reason, "daily_limit");
  assert.equal(tripped.state.breakerOpen, true);
  const stillOpen = admitUsage(tripped.state, "protocol", limits, at("2026-08-31T12:01:02Z"));
  assert.equal(stillOpen.admitted, false);
  if (!stillOpen.admitted) assert.equal(stillOpen.reason, "breaker_open");
});

test("expensive quota trips independently and the next UTC period resets safely", () => {
  const initial = admitUsage(undefined, "expensive", limits, at("2026-08-31T23:57:00Z"));
  assert.equal(initial.admitted, true);
  const quota = admitUsage(initial.state, "expensive", limits, at("2026-08-31T23:58:00Z"));
  assert.equal(quota.admitted, false);
  if (!quota.admitted) assert.equal(quota.reason, "expensive_daily_limit");
  const nextDay = admitUsage(quota.state, "protocol", limits, at("2026-09-01T00:00:00Z"));
  assert.equal(nextDay.admitted, true);
  assert.equal(nextDay.state.breakerOpen, false);
  assert.equal(nextDay.state.expensiveCount, 0);
  assert.deepEqual(resetUsage(at("2026-09-01T00:00:00Z")), nextDay.state);
});

test("a complete MCP handshake does not consume useful-operation rate capacity", () => {
  let state = emptyUsageState(at("2026-08-31T12:00:00Z"));
  for (const operation of ["protocol", "protocol", "protocol", "normal"] as const) {
    const result = admitUsage(state, operation, limits, at("2026-08-31T12:00:01Z"));
    assert.equal(result.admitted, true);
    state = result.state;
  }
  assert.equal(state.normalCount, 1);
  assert.equal(state.normalMinuteCount, 1);
  assert.equal(state.expensiveCount, 0);
});
