import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateUsage,
  admitUsage,
  admitUsageAtomically,
  emptyUsageState,
  monthEndForecast,
  resetUsage,
  type AdmissionLimits,
  type TierAdmissionPolicy,
  type UsageState,
  type UsageStorage,
} from "./cloudflare-usage.js";

const owner = { principalKey: "a".repeat(32), tier: 0 as const };
const trusted = { principalKey: "b".repeat(32), tier: 1 as const };
const experimental = { principalKey: "c".repeat(32), tier: 2 as const };
const policy: TierAdmissionPolicy = {
  revision: "family-v1",
  principalKeys: [owner.principalKey, trusted.principalKey, experimental.principalKey],
  budgets: {
    principal_minute_limits: { "0": 60, "1": 20, "2": 5 },
    tier0_reserve: { minute: 2, month: 20 },
    guest_limit: { minute: 8, month: 980 },
    tier1_shed_at: { minute: 8, month: 900 },
    tier2_shed_at: { minute: 4, month: 500 },
  },
};
const limits: AdmissionLimits = { dailyLimit: 2, expensiveDailyLimit: 1, rateLimit: 1, expensiveRateLimit: 1 };
const generousLimits: AdmissionLimits = { dailyLimit: 5_000, expensiveDailyLimit: 500, rateLimit: 60, expensiveRateLimit: 10 };
const at = (value: string) => new Date(value);

test("usage admission retains global rates and persistent daily breakers", () => {
  let state = emptyUsageState(at("2026-08-31T12:00:00Z"));
  const normal = admitUsage(state, "normal", limits, owner, policy, at("2026-08-31T12:00:01Z"));
  assert.equal(normal.admitted, true);
  state = normal.state;
  const rateLimited = admitUsage(state, "normal", limits, owner, policy, at("2026-08-31T12:00:02Z"));
  assert.equal(rateLimited.admitted, false);
  if (!rateLimited.admitted) assert.equal(rateLimited.reason, "rate_limit");
  const expensive = admitUsage(state, "expensive", limits, owner, policy, at("2026-08-31T12:01:00Z"));
  assert.equal(expensive.admitted, true);
  state = expensive.state;
  const tripped = admitUsage(state, "normal", limits, owner, policy, at("2026-08-31T12:01:01Z"));
  assert.equal(tripped.admitted, false);
  if (!tripped.admitted) assert.equal(tripped.reason, "daily_limit");
  assert.equal(tripped.state.breakerOpen, true);
  const stillOpen = admitUsage(tripped.state, "protocol", limits, owner, policy, at("2026-08-31T12:01:02Z"));
  assert.equal(stillOpen.admitted, false);
  if (!stillOpen.admitted) assert.equal(stillOpen.reason, "breaker_open");
});

test("expensive quota trips independently and UTC periods reset only their counters", () => {
  const initial = admitUsage(undefined, "expensive", limits, owner, policy, at("2026-08-31T23:57:00Z"));
  assert.equal(initial.admitted, true);
  const quota = admitUsage(initial.state, "expensive", limits, owner, policy, at("2026-08-31T23:58:00Z"));
  assert.equal(quota.admitted, false);
  if (!quota.admitted) assert.equal(quota.reason, "expensive_daily_limit");
  const nextDay = admitUsage(quota.state, "protocol", limits, owner, policy, at("2026-09-01T00:00:00Z"));
  assert.equal(nextDay.admitted, true);
  assert.equal(nextDay.state.breakerOpen, false);
  assert.equal(nextDay.state.expensiveCount, 0);
  assert.equal(nextDay.state.tiers["0"].dayCount, 0);
  assert.equal(nextDay.state.tiers["0"].monthCount, 0);
  assert.equal(resetUsage(at("2026-09-01T00:00:00Z"), policy.revision).policyRevision, policy.revision);
});

test("protocol traffic does not consume global, tier, or principal useful-operation capacity", () => {
  let state = emptyUsageState(at("2026-09-30T12:00:00Z"));
  for (const operation of ["protocol", "protocol", "protocol", "normal"] as const) {
    const result = admitUsage(state, operation, limits, owner, policy, at("2026-09-30T12:00:01Z"));
    assert.equal(result.admitted, true);
    state = result.state;
  }
  assert.equal(state.normalCount, 1);
  assert.equal(state.tiers["0"].minuteCount, 1);
  assert.equal(state.principals[owner.principalKey]?.monthCount, 1);
});

test("Tier 2 sheds before Tier 1 while Tier 0 keeps the reserved headroom", () => {
  let state: UsageState | undefined;
  const now = at("2026-09-30T12:00:00Z");
  for (let index = 0; index < 3; index += 1) {
    const result = admitUsage(state, "normal", generousLimits, experimental, policy, now);
    assert.equal(result.admitted, true);
    state = result.state;
  }
  const tier2Denied = admitUsage(state, "normal", generousLimits, experimental, policy, now);
  assert.equal(tier2Denied.admitted, false);
  if (!tier2Denied.admitted) assert.equal(tier2Denied.reason, "tier_2_shed");
  for (let index = 0; index < 4; index += 1) {
    const result = admitUsage(state, "normal", generousLimits, trusted, policy, now);
    assert.equal(result.admitted, true);
    state = result.state;
  }
  const tier1Denied = admitUsage(state, "normal", generousLimits, trusted, policy, now);
  assert.equal(tier1Denied.admitted, false);
  if (!tier1Denied.admitted) assert.equal(tier1Denied.reason, "tier_1_shed");
  assert.equal(admitUsage(state, "normal", generousLimits, owner, policy, now).admitted, true);
});

test("per-principal limits are independent and policy revisions preserve retained-key usage", () => {
  const strict = {
    ...policy,
    budgets: { ...policy.budgets, principal_minute_limits: { "0": 60, "1": 1, "2": 1 } },
  };
  const now = at("2026-09-30T12:00:00Z");
  const first = admitUsage(undefined, "normal", generousLimits, trusted, strict, now);
  assert.equal(first.admitted, true);
  const denied = admitUsage(first.state, "normal", generousLimits, trusted, strict, now);
  assert.equal(denied.admitted, false);
  if (!denied.admitted) assert.equal(denied.reason, "principal_rate_limit");
  assert.equal(admitUsage(first.state, "normal", generousLimits, experimental, strict, now).admitted, true);
  const rotated = admitUsage(first.state, "protocol", generousLimits, trusted, { ...strict, revision: "family-v2" }, now);
  assert.equal(rotated.state.policyRevision, "family-v2");
  assert.equal(rotated.state.principals[trusted.principalKey]?.minuteCount, 1);
});

test("the month-end forecast uses completed UTC days and rounds upward", () => {
  assert.equal(monthEndForecast(14, at("2026-09-15T00:00:00Z")), 30);
  assert.equal(monthEndForecast(1, at("2026-02-01T00:00:00Z")), 28);
  assert.equal(monthEndForecast(31, at("2026-01-31T00:00:00Z")), 33);
});

test("concurrent requests cannot both consume the final global allocation", async () => {
  let state: UsageState | undefined;
  let tail = Promise.resolve();
  const storage: UsageStorage = {
    transaction: async <T>(callback: () => Promise<T>) => {
      const result = tail.then(callback);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
    get: async <T>() => state as T | undefined,
    put: async (_key, value) => { state = value; },
  };
  const one: AdmissionLimits = { ...generousLimits, dailyLimit: 1 };
  const results = await Promise.all([
    admitUsageAtomically(storage, "normal", one, owner, policy, at("2026-09-30T12:00:00Z")),
    admitUsageAtomically(storage, "normal", one, owner, policy, at("2026-09-30T12:00:00Z")),
  ]);
  assert.equal(results.filter(({ admitted }) => admitted).length, 1);
  assert.equal(state?.normalCount, 1);
  assert.equal(state?.breakerOpen, true);
});

test("global breakers override guest tier capacity", () => {
  const one: AdmissionLimits = { ...generousLimits, dailyLimit: 1 };
  const admitted = admitUsage(undefined, "normal", one, trusted, policy, at("2026-09-30T12:00:00Z"));
  assert.equal(admitted.admitted, true);
  const denied = admitUsage(admitted.state, "normal", one, trusted, policy, at("2026-09-30T12:00:01Z"));
  assert.equal(denied.admitted, false);
  if (!denied.admitted) assert.equal(denied.reason, "daily_limit");
});

test("aggregate usage reports bounded tier counts and headroom without principal keys", () => {
  const now = at("2026-09-30T12:00:00Z");
  const admitted = admitUsage(undefined, "normal", generousLimits, trusted, policy, now);
  const denied = admitUsage(admitted.state, "normal", { ...generousLimits, rateLimit: 1 }, trusted, policy, now);
  assert.equal(denied.admitted, false);
  const aggregate = aggregateUsage(denied.state, policy, now);
  assert.equal(aggregate.tiers["1"].admitted.minute, 1);
  assert.equal(aggregate.tiers["1"].rejected.rate_limit.minute, 1);
  assert.equal(aggregate.tiers["1"].remaining_headroom.minute, 6);
  const text = JSON.stringify(aggregate);
  assert.doesNotMatch(text, new RegExp(owner.principalKey, "u"));
  assert.doesNotMatch(text, new RegExp(trusted.principalKey, "u"));
  assert.doesNotMatch(text, /principals|username|password|subject/iu);
});
