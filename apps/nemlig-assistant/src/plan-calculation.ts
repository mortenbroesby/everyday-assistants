import type { Basket } from "./client.js";
import type { PlanCandidate, ShoppingPlan, StoredShoppingPlanInput } from "./plans.js";

export interface DiscoveredPlanLine { candidates: PlanCandidate[]; unavailable: boolean }

const normalizedWords = (value: string): string[] => value.toLocaleLowerCase("da-DK").match(/[\p{L}\p{N}]+/gu) ?? [];
const automaticCandidate = (name: string, candidates: PlanCandidate[]): { candidate?: PlanCandidate; reason: "unique_candidate" | "clear_text_match" | "close_alternatives" | "no_eligible_candidate" | "unavailable" } => {
  const available = candidates.filter((candidate) => candidate.available);
  if (!available.length) return { reason: candidates.length ? "unavailable" : "no_eligible_candidate" };
  if (available.length === 1) return { candidate: available[0], reason: "unique_candidate" };
  const wanted = normalizedWords(name);
  const covers = (candidate: PlanCandidate): boolean => wanted.length > 0 && wanted.every((word) => new Set(normalizedWords(`${candidate.brand} ${candidate.name}`)).has(word));
  return covers(available[0]!) && !available.slice(1).some(covers) ? { candidate: available[0], reason: "clear_text_match" } : { reason: "close_alternatives" };
};

export const calculateShoppingPlan = (input: StoredShoppingPlanInput, discovered: DiscoveredPlanLine[], basket: Basket): ShoppingPlan => {
  const quantities = new Map<number, number>();
  for (const item of basket.items) if (item.id !== undefined && !Number.isNaN(item.id)) quantities.set(item.id, (quantities.get(item.id) ?? 0) + (item.quantity ?? 0));
  let total = 0;
  const lines = input.lines.map((line, index) => {
    const { candidates, unavailable } = discovered[index]!; const automatic = automaticCandidate(line.name, candidates);
    const selected = line.selected_product_id === undefined ? (input.mode === "automatic" ? automatic.candidate : undefined) : candidates.find((candidate) => candidate.id === line.selected_product_id && candidate.available);
    const basketQuantity = selected ? (quantities.get(selected.id) ?? 0) : 0; const remainingQuantity = selected ? Math.max(0, line.quantity - basketQuantity) : line.quantity;
    if (selected?.price !== undefined) total += selected.price * remainingQuantity;
    const resolution: ShoppingPlan["lines"][number]["resolution"] = selected ? (remainingQuantity === 0 ? "covered" : "selected") : "unresolved";
    const clarityReason: ShoppingPlan["lines"][number]["clarity_reason"] = line.selected_product_id !== undefined ? (selected ? "exact_product" : "unavailable") : unavailable ? "discovery_unavailable" : input.mode === "manual" ? "manual_choice" : automatic.reason;
    return { id: line.id, name: line.name, quantity: line.quantity, candidates, resolution, reason: selected ? undefined : clarityReason, clarity: selected ? "clear" as const : "unclear" as const, clarity_reason: clarityReason, selected_product_id: selected?.id, basket_quantity: basketQuantity, remaining_quantity: remainingQuantity };
  });
  const covered = lines.filter((line) => line.resolution === "covered").length; const automaticallySelected = input.mode === "automatic" ? lines.filter((line, index) => line.resolution === "selected" && input.lines[index]?.selected_product_id === undefined).length : 0; const failed = lines.filter((line) => line.clarity_reason === "discovery_unavailable").length; const unresolved = lines.filter((line) => line.resolution === "unresolved" && line.clarity_reason !== "discovery_unavailable").length;
  return { mode: input.mode, lines, selected_estimated_total: Math.round(total * 100) / 100, summary: { total: lines.length, covered, automatically_selected: automaticallySelected, added: 0, unresolved, failed, automatic_coverage_percent: Math.round(((covered + automaticallySelected) / lines.length) * 100) } };
};
