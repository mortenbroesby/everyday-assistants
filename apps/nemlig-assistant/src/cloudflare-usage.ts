import type { OperationClass } from "./cloudflare-gateway.js";
import type { PrincipalPolicy } from "./principal-policy.js";

export type BreakerReason = "daily_limit" | "expensive_daily_limit";
export type Tier = 0 | 1 | 2;
export type TierKey = "0" | "1" | "2";
export const ADMISSION_REASONS = [
  "rate_limit", "principal_rate_limit", "family_reserve", "tier_1_shed",
  "tier_2_shed", "daily_limit", "expensive_daily_limit", "breaker_open",
] as const;
export type AdmissionReason = typeof ADMISSION_REASONS[number];

export interface PeriodUsage {
  minute: string;
  minuteCount: number;
  day: string;
  dayCount: number;
  month: string;
  monthCount: number;
}

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
  policyRevision: string;
  tiers: Record<TierKey, PeriodUsage>;
  rejections: Record<TierKey, Record<AdmissionReason, PeriodUsage>>;
  principals: Record<string, PeriodUsage>;
}

export interface AdmissionLimits {
  dailyLimit: number;
  expensiveDailyLimit: number;
  rateLimit: number;
  expensiveRateLimit: number;
}

export interface AdmissionPrincipal { principalKey: string; tier: Tier }
export interface TierAdmissionPolicy {
  revision: string;
  budgets: PrincipalPolicy["budgets"];
  principalKeys: string[];
}

export type AdmissionResult =
  | { admitted: true; state: UsageState }
  | { admitted: false; status: 429 | 503; reason: AdmissionReason; state: UsageState };

const periods = (now: Date) => {
  const iso = now.toISOString();
  return { minute: iso.slice(0, 16), day: iso.slice(0, 10), month: iso.slice(0, 7) };
};

const emptyPeriodUsage = (now: Date): PeriodUsage => {
  const current = periods(now);
  return { ...current, minuteCount: 0, dayCount: 0, monthCount: 0 };
};

const emptyRejections = (now: Date): Record<AdmissionReason, PeriodUsage> => Object.fromEntries(
  ADMISSION_REASONS.map((reason) => [reason, emptyPeriodUsage(now)]),
) as Record<AdmissionReason, PeriodUsage>;

export const emptyUsageState = (now: Date, policyRevision = "unconfigured"): UsageState => {
  const current = periods(now);
  return {
    period: current.day,
    normalCount: 0,
    expensiveCount: 0,
    breakerOpen: false,
    normalMinute: current.minute,
    normalMinuteCount: 0,
    expensiveMinute: current.minute,
    expensiveMinuteCount: 0,
    policyRevision,
    tiers: { "0": emptyPeriodUsage(now), "1": emptyPeriodUsage(now), "2": emptyPeriodUsage(now) },
    rejections: { "0": emptyRejections(now), "1": emptyRejections(now), "2": emptyRejections(now) },
    principals: {},
  };
};

const currentPeriodUsage = (stored: PeriodUsage | undefined, now: Date): PeriodUsage => {
  const current = periods(now);
  return {
    minute: current.minute,
    minuteCount: stored?.minute === current.minute ? stored.minuteCount : 0,
    day: current.day,
    dayCount: stored?.day === current.day ? stored.dayCount : 0,
    month: current.month,
    monthCount: stored?.month === current.month ? stored.monthCount : 0,
  };
};

const currentState = (stored: UsageState | undefined, policy: TierAdmissionPolicy, now: Date): UsageState => {
  const current = periods(now);
  const sameDay = stored?.period === current.day;
  const state: UsageState = {
    ...emptyUsageState(now, policy.revision),
    normalCount: sameDay ? stored.normalCount : 0,
    expensiveCount: sameDay ? stored.expensiveCount : 0,
    breakerOpen: sameDay ? stored.breakerOpen : false,
    ...(sameDay && stored.trippedAt ? { trippedAt: stored.trippedAt } : {}),
    ...(sameDay && stored.tripReason ? { tripReason: stored.tripReason } : {}),
    normalMinuteCount: stored?.normalMinute === current.minute ? stored.normalMinuteCount : 0,
    expensiveMinuteCount: stored?.expensiveMinute === current.minute ? stored.expensiveMinuteCount : 0,
    tiers: {
      "0": currentPeriodUsage(stored?.tiers?.["0"], now),
      "1": currentPeriodUsage(stored?.tiers?.["1"], now),
      "2": currentPeriodUsage(stored?.tiers?.["2"], now),
    },
    rejections: { "0": emptyRejections(now), "1": emptyRejections(now), "2": emptyRejections(now) },
  };
  for (const tier of ["0", "1", "2"] as const) {
    for (const reason of ADMISSION_REASONS) {
      state.rejections[tier][reason] = currentPeriodUsage(stored?.rejections?.[tier]?.[reason], now);
    }
  }
  for (const principalKey of policy.principalKeys) {
    state.principals[principalKey] = currentPeriodUsage(stored?.principals?.[principalKey], now);
  }
  return state;
};

export function monthEndForecast(monthToDate: number, now: Date): number {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const completedDays = Math.max(1, now.getUTCDate() - 1);
  return Math.max(monthToDate, Math.ceil(monthToDate * daysInMonth / completedDays));
}

const counts = ({ minuteCount, dayCount, monthCount }: PeriodUsage) => ({
  minute: minuteCount,
  day: dayCount,
  month: monthCount,
});

export function aggregateUsage(
  stored: UsageState | undefined,
  policy: TierAdmissionPolicy,
  now = new Date(),
) {
  const state = currentState(stored, policy, now);
  const totalMinute = state.tiers["0"].minuteCount + state.tiers["1"].minuteCount + state.tiers["2"].minuteCount;
  const totalMonth = state.tiers["0"].monthCount + state.tiers["1"].monthCount + state.tiers["2"].monthCount;
  const guestMinute = state.tiers["1"].minuteCount + state.tiers["2"].minuteCount;
  const guestMonth = state.tiers["1"].monthCount + state.tiers["2"].monthCount;
  const headroom = (tier: TierKey) => {
    if (tier === "0") return {
      minute: Math.max(0, policy.budgets.tier0_reserve.minute - state.tiers["0"].minuteCount),
      month: Math.max(0, policy.budgets.tier0_reserve.month - state.tiers["0"].monthCount),
    };
    const threshold = tier === "1" ? policy.budgets.tier1_shed_at : policy.budgets.tier2_shed_at;
    return {
      minute: Math.max(0, Math.min(policy.budgets.guest_limit.minute - guestMinute, threshold.minute - totalMinute - 1)),
      month: Math.max(0, Math.min(policy.budgets.guest_limit.month - guestMonth, threshold.month - monthEndForecast(totalMonth, now) - 1)),
    };
  };
  return {
    schema_version: 1 as const,
    policy_revision: state.policyRevision,
    period: state.period,
    global: {
      normal_day: state.normalCount,
      expensive_day: state.expensiveCount,
      breaker_open: state.breakerOpen,
      ...(state.trippedAt ? { tripped_at: state.trippedAt } : {}),
      ...(state.tripReason ? { trip_reason: state.tripReason } : {}),
    },
    tiers: Object.fromEntries((["0", "1", "2"] as const).map((tier) => [tier, {
      admitted: counts(state.tiers[tier]),
      rejected: Object.fromEntries(ADMISSION_REASONS.map((reason) => [reason, counts(state.rejections[tier][reason])])),
      remaining_headroom: headroom(tier),
    }])) as Record<TierKey, {
      admitted: ReturnType<typeof counts>;
      rejected: Record<AdmissionReason, ReturnType<typeof counts>>;
      remaining_headroom: { minute: number; month: number };
    }>,
  };
}

const deny = (state: UsageState, tier: Tier, reason: AdmissionReason, now: Date, status: 429 | 503 = 429): AdmissionResult => {
  const rejected = state.rejections[String(tier) as TierKey][reason];
  rejected.minuteCount += 1;
  rejected.dayCount += 1;
  rejected.monthCount += 1;
  return { admitted: false, status, reason, state };
};

export function admitUsage(
  stored: UsageState | undefined,
  operation: OperationClass,
  limits: AdmissionLimits,
  principal: AdmissionPrincipal,
  policy: TierAdmissionPolicy,
  now = new Date(),
): AdmissionResult {
  const state = currentState(stored, policy, now);
  if (state.breakerOpen) return deny(state, principal.tier, "breaker_open", now, 503);
  if (operation === "protocol") return { admitted: true, state };

  const expensive = operation === "expensive";
  const minuteCountKey = expensive ? "expensiveMinuteCount" : "normalMinuteCount";
  const rateLimit = expensive ? limits.expensiveRateLimit : limits.rateLimit;
  if (state[minuteCountKey] >= rateLimit) return deny(state, principal.tier, "rate_limit", now);

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
    return deny(state, principal.tier, tripReason, now, 503);
  }

  const principalUsage = state.principals[principal.principalKey];
  if (!principalUsage || principalUsage.minuteCount >= policy.budgets.principal_minute_limits[String(principal.tier) as TierKey]) {
    return deny(state, principal.tier, "principal_rate_limit", now);
  }

  const tierUsage = state.tiers[String(principal.tier) as TierKey];
  if (principal.tier > 0) {
    const guestMinute = state.tiers["1"].minuteCount + state.tiers["2"].minuteCount + 1;
    const guestMonth = state.tiers["1"].monthCount + state.tiers["2"].monthCount + 1;
    if (guestMinute > policy.budgets.guest_limit.minute || guestMonth > policy.budgets.guest_limit.month) {
      return deny(state, principal.tier, "family_reserve", now);
    }
    const totalMinute = state.tiers["0"].minuteCount + guestMinute;
    const totalMonth = state.tiers["0"].monthCount + guestMonth;
    const threshold = principal.tier === 2 ? policy.budgets.tier2_shed_at : policy.budgets.tier1_shed_at;
    if (totalMinute >= threshold.minute || monthEndForecast(totalMonth, now) >= threshold.month) {
      return deny(state, principal.tier, principal.tier === 2 ? "tier_2_shed" : "tier_1_shed", now);
    }
  }

  state[minuteCountKey] += 1;
  if (expensive) state.expensiveCount += 1;
  else state.normalCount += 1;
  for (const usage of [tierUsage, principalUsage]) {
    usage.minuteCount += 1;
    usage.dayCount += 1;
    usage.monthCount += 1;
  }
  return { admitted: true, state };
}

export const resetUsage = (now = new Date(), policyRevision = "unconfigured"): UsageState =>
  emptyUsageState(now, policyRevision);

export interface UsageStorage {
  transaction<T>(callback: () => Promise<T>): Promise<T>;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: UsageState): Promise<void>;
}

export const admitUsageAtomically = (
  storage: UsageStorage,
  operation: OperationClass,
  limits: AdmissionLimits,
  principal: AdmissionPrincipal,
  policy: TierAdmissionPolicy,
  now = new Date(),
): Promise<AdmissionResult> => storage.transaction(async () => {
  const result = admitUsage(await storage.get<UsageState>("usage"), operation, limits, principal, policy, now);
  await storage.put("usage", result.state);
  return result;
});
