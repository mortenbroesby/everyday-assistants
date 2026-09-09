import type { Basket } from "./client.js";
import type { PlanCandidate, ShoppingPlan, StoredShoppingPlanInput } from "./plans.js";

/** One discovery result per input line, in matching order; unavailable denotes a failed lookup. */
export interface DiscoveredPlanLine { candidates: PlanCandidate[]; unavailable: boolean }
type ClarityReason = ShoppingPlan["lines"][number]["clarity_reason"];

const normalizedWords = (value: string): string[] => value.toLocaleLowerCase("da-DK").match(/[\p{L}\p{N}]+/gu) ?? [];
const automaticCandidate = (line: StoredShoppingPlanInput["lines"][number], candidates: PlanCandidate[]): { candidate?: PlanCandidate; reason: "unique_candidate" | "clear_text_match" | "preferred_brand" | "amount_match" | "brand_choice" | "close_alternatives" | "no_eligible_candidate" | "unavailable" } => {
  const available = candidates.filter((candidate) => candidate.available);
  if (!available.length) return { reason: candidates.length ? "unavailable" : "no_eligible_candidate" };
  if (line.requested_amount !== undefined && available[0]?.required_packages === undefined) return { reason: "close_alternatives" };
  if (line.require_choice && !available[0]?.preferred_brand_match) return { reason: "brand_choice" };
  if (available.length === 1) return { candidate: available[0], reason: "unique_candidate" };
  if (available[0]?.preferred_brand_match && !available.slice(1).some((candidate) => candidate.preferred_brand_match)) return { candidate: available[0], reason: "preferred_brand" };
  if (line.requested_amount !== undefined && (available[0]?.excess_amount ?? Infinity) < (available[1]?.excess_amount ?? Infinity)) return { candidate: available[0], reason: "amount_match" };
  const wanted = normalizedWords(line.name);
  const covers = (candidate: PlanCandidate): boolean => {
    const words = new Set(normalizedWords(`${candidate.brand} ${candidate.name}`));
    return wanted.length > 0 && wanted.every((word) => words.has(word));
  };
  return covers(available[0]!) && !available.slice(1).some(covers)
    ? { candidate: available[0], reason: "clear_text_match" }
    : { reason: "close_alternatives" };
};

/** Calculates a plan from validated input and positional discovery results without I/O. */
export const calculateShoppingPlan = (input: StoredShoppingPlanInput, discovered: DiscoveredPlanLine[], basket: Basket): ShoppingPlan => {
  const basketQuantities = new Map<number, number>();
  for (const item of basket.items) {
    if (item.id === undefined || Number.isNaN(item.id)) continue;
    basketQuantities.set(item.id, (basketQuantities.get(item.id) ?? 0) + (item.quantity ?? 0));
  }
  let selectedEstimatedTotal = 0;
  const lines = input.lines.map((line, index) => {
    const { candidates, unavailable } = discovered[index]!;
    const automatic = automaticCandidate(line, candidates);
    const selected = line.selected_product_id === undefined
      ? (input.mode === "automatic" ? automatic.candidate : undefined)
      : candidates.find((candidate) => candidate.id === line.selected_product_id && candidate.available);
    const basketQuantity = selected ? (basketQuantities.get(selected.id) ?? 0) : 0;
    const requiredQuantity = selected?.required_packages ?? line.quantity;
    const remainingQuantity = selected ? Math.max(0, requiredQuantity - basketQuantity) : requiredQuantity;
    if (selected?.price !== undefined) selectedEstimatedTotal += selected.price * remainingQuantity;
    const resolution: "selected" | "covered" | "unresolved" = selected ? (remainingQuantity === 0 ? "covered" : "selected") : "unresolved";
    const clarityReason: ClarityReason = line.selected_product_id !== undefined ? (selected ? "exact_product" : "unavailable")
      : unavailable ? "discovery_unavailable"
      : input.mode === "manual" ? "manual_choice"
      : automatic.reason;
    return { id: line.id, name: line.name, quantity: line.quantity, candidates, resolution, reason: selected ? undefined : clarityReason, clarity: selected ? "clear" as const : "unclear" as const, clarity_reason: clarityReason, selected_product_id: selected?.id, basket_quantity: basketQuantity, remaining_quantity: remainingQuantity, ...(line.requested_amount !== undefined ? { requested_amount: line.requested_amount, requested_unit: line.requested_unit } : {}) };
  });
  const covered = lines.filter((line) => line.resolution === "covered").length;
  const automaticallySelected = input.mode === "automatic"
    ? lines.filter((line, index) => line.resolution === "selected" && input.lines[index]?.selected_product_id === undefined).length
    : 0;
  const failed = lines.filter((line) => line.clarity_reason === "discovery_unavailable").length;
  const unresolved = lines.filter((line) => line.resolution === "unresolved" && line.clarity_reason !== "discovery_unavailable").length;
  return {
    mode: input.mode,
    lines,
    selected_estimated_total: Math.round(selectedEstimatedTotal * 100) / 100,
    summary: { total: lines.length, covered, automatically_selected: automaticallySelected, added: 0, unresolved, failed, automatic_coverage_percent: Math.round(((covered + automaticallySelected) / lines.length) * 100) },
  };
};
