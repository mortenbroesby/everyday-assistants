import type { OperationClass } from "./cloudflare-gateway.js";

export type BreakerReason = "daily_limit" | "expensive_daily_limit";

export interface UsageState {
  period: string;
  normalCount: number;
  expensiveCount: number;
  breakerOpen: boolean;
  trippedAt?: string;
  tripReason?: BreakerReason;
  normalMinute: string;
  normalMinuteCount: number;
  expensiveMinute: string;
  expensiveMinuteCount: number;
}

export interface AdmissionLimits {
  dailyLimit: number;
  expensiveDailyLimit: number;
  rateLimit: number;
  expensiveRateLimit: number;
}

export type AdmissionResult =
  | { admitted: true; state: UsageState }
  | { admitted: false; status: 429 | 503; reason: "rate_limit" | BreakerReason | "breaker_open"; state: UsageState };

export const emptyUsageState = (now: Date): UsageState => ({
  period: now.toISOString().slice(0, 10),
  normalCount: 0,
  expensiveCount: 0,
  breakerOpen: false,
  normalMinute: now.toISOString().slice(0, 16),
  normalMinuteCount: 0,
  expensiveMinute: now.toISOString().slice(0, 16),
  expensiveMinuteCount: 0,
});

export function admitUsage(
  stored: UsageState | undefined,
  operation: OperationClass,
  limits: AdmissionLimits,
  now = new Date(),
): AdmissionResult {
  const period = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(0, 16);
  const state = stored?.period === period ? { ...stored } : emptyUsageState(now);
  if (state.breakerOpen) return { admitted: false, status: 503, reason: "breaker_open", state };
  if (operation === "protocol") return { admitted: true, state };

  const expensive = operation === "expensive";
  const minuteKey = expensive ? "expensiveMinute" : "normalMinute";
  const minuteCountKey = expensive ? "expensiveMinuteCount" : "normalMinuteCount";
  if (state[minuteKey] !== minute) {
    state[minuteKey] = minute;
    state[minuteCountKey] = 0;
  }
  const rateLimit = expensive ? limits.expensiveRateLimit : limits.rateLimit;
  if (state[minuteCountKey] >= rateLimit) return { admitted: false, status: 429, reason: "rate_limit", state };

  const total = state.normalCount + state.expensiveCount;
  const tripReason: BreakerReason | undefined = total + 1 > limits.dailyLimit
    ? "daily_limit"
    : expensive && state.expensiveCount + 1 > limits.expensiveDailyLimit
      ? "expensive_daily_limit"
      : undefined;
  if (tripReason) {
    state.breakerOpen = true;
    state.trippedAt = now.toISOString();
    state.tripReason = tripReason;
    return { admitted: false, status: 503, reason: tripReason, state };
  }

  state[minuteCountKey] += 1;
  if (expensive) state.expensiveCount += 1;
  else state.normalCount += 1;
  return { admitted: true, state };
}

export const resetUsage = (now = new Date()): UsageState => emptyUsageState(now);
