import { journeyFor, type PickerPayload } from "./contract.js";

export type PickerHost<Result = unknown, Context = unknown> = {
  sendMessage(message: { role: "user"; content: Array<{ type: "text"; text: string }> }): Promise<unknown>;
  ontoolresult?: (result: Result) => void;
  onhostcontextchanged?: (context: Context) => void;
};

export type PickerSelection = { ingredient: string; product: number; quantity: number };

type ProductPayload = Exclude<PickerPayload, { presentation: "list" }>;

export const pickerModelContext = (payload: PickerPayload, choices: Record<number, number>, included: Record<number, boolean>) => {
  if (payload.presentation === "list") return {
    stage: "list",
    list: payload.list.map((row, index) => ({ ...row, included: included[index] ?? row.included })),
  };
  const journey = journeyFor(payload);
  const focused = payload.items.map((item, index) => {
    const selected = payload.presentation === "choices" ? choices[index] ?? item.product.id : item.product.id;
    const original = journey.proposal?.items.find(({ ingredient }) => ingredient === item.ingredient)?.product;
    return { ingredient: item.ingredient, product: selected, quantity: item.quantity, changed: item.changed || original !== undefined && selected !== original };
  });
  const items = (payload.presentation === "choices" ? journey.proposal?.items : undefined)?.map((item) =>
    focused.find(({ ingredient }) => ingredient === item.ingredient) ?? item,
  ) ?? focused;
  return { stage: payload.presentation, list: journey.list, items, rejected: payload.rejected?.map(({ ingredient }) => ingredient) ?? [] };
};

export const openPickerChoices = (payload: ProductPayload, itemIndex: number): ProductPayload | undefined => {
  if (payload.presentation !== "proposal") return undefined;
  const item = payload.items[itemIndex];
  if (!item?.alternatives?.length) return undefined;
  const journey = journeyFor(payload);
  return {
    presentation: "choices",
    items: [item],
    pantry_assumptions: payload.pantry_assumptions,
    rejected: payload.rejected,
    journey: {
      ...journey,
      choices: {
        items: [journey.proposal!.items[itemIndex]!],
        pantry_assumptions: payload.pantry_assumptions ?? [],
      },
    },
  };
};

export const advancePicker = (
  payload: PickerPayload,
  choices: Record<number, number>,
  proposal?: ProductPayload,
): PickerPayload | undefined => {
  if (payload.presentation === "list" || payload.presentation === "recap") return undefined;
  const journey = journeyFor(payload);
  if (payload.presentation === "proposal") {
    return { ...payload, presentation: "recap", journey: { ...journey, previous: "proposal" } };
  }
  if (!proposal || proposal.presentation !== "proposal") return undefined;
  const replacements = payload.items.map((item, index) => {
    const candidates = [item.product, ...(item.alternatives ?? [])];
    const product = candidates.find(({ id }) => id === (choices[index] ?? item.product.id)) ?? item.product;
    const original = proposal.items.find((line) => line.ingredient === item.ingredient);
    return {
      ...item,
      product,
      alternatives: candidates.filter(({ id }) => id !== product.id),
      favorite_match: product.id === item.product.id && item.favorite_match,
      changed: product.id !== (original?.product.id ?? item.product.id),
    };
  });
  return {
    presentation: "recap",
    items: proposal.items.map((item) => replacements.find((line) => line.ingredient === item.ingredient) ?? item),
    pantry_assumptions: proposal.pantry_assumptions,
    rejected: proposal.rejected ?? payload.rejected,
    journey: { ...journey, choices: journeyFor({ ...payload, items: replacements }).choices, previous: "choices" },
  };
};

const message = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] });

export const bindPickerHost = <Result, Context>(host: PickerHost<Result, Context>, onResult: (result: Result) => void, onContext?: (context: Context) => void) => {
  let active = true;
  let messagePending = false;
  const handleResult = (result: Result) => { if (active) onResult(result); };
  const handleContext = (context: Context) => { if (active) onContext?.(context); };
  const send = (text: string): Promise<unknown> => {
    if (!active || messagePending) return Promise.resolve();
    messagePending = true;
    return host.sendMessage(message(text)).finally(() => { messagePending = false; });
  };
  host.ontoolresult = handleResult;
  if (onContext) host.onhostcontextchanged = handleContext;
  return {
    sendNavigation: (payload: PickerPayload, direction: "back" | "next", choices: Record<number, number>, included: Record<number, boolean> = {}) => {
      const boundary = " Do not read or change the basket. Preserve the journey context in the next view.";
      if (payload.presentation === "list") {
        if (direction === "back") return Promise.resolve();
        const list = payload.list.map((row, index) => ({ ...row, included: included[index] ?? row.included }));
        const selected = list.filter(({ included }) => included);
        if (!selected.length) return Promise.resolve();
        return send(`Search only these checked lines: ${JSON.stringify(selected)}. Use find_groceries with short Danish terms and render review_proposed_basket in proposal mode. Carry journey: ${JSON.stringify({ list })}.${boundary}`);
      }
      const journey = journeyFor(payload);
      if (direction === "back" && payload.presentation === "proposal") {
        return send(`Restore List with review_shopping_list using ${JSON.stringify({ list: journey.list })}.${boundary}`);
      }
      if (direction === "next" && payload.presentation === "recap") return Promise.resolve();
      const target = direction === "next" ? "recap" : payload.presentation === "recap" && journey.previous === "choices" ? "choices" : "proposal";
      let snapshot = target === "choices" ? journey.choices : journey.proposal;
      if (!snapshot && direction === "back") return send(`Restore the complete preceding ${target === "choices" ? "Choices" : "Proposal"} from this conversation using review_proposed_basket. Keep every unchallenged selection and reconstruct the missing earlier review context. Current bounded journey: ${JSON.stringify(journey)}.${boundary}`);
      if (direction === "next" && payload.presentation === "choices") {
        const replacements = journey.choices!.items.map((item, index) => {
          const chosen = choices[index] ?? item.product;
          const product = chosen === item.product || item.alternatives.includes(chosen) ? chosen : item.product;
          return { ...item, product, favorite_match: product === item.product && item.favorite_match, alternatives: [item.product, ...item.alternatives].filter((id) => id !== product), changed: product !== (journey.proposal?.items.find((line) => line.ingredient === item.ingredient)?.product ?? item.product) };
        });
        snapshot = { items: (journey.proposal?.items ?? journey.choices!.items).map((item) => replacements.find((line) => line.ingredient === item.ingredient) ?? item), pantry_assumptions: payload.pantry_assumptions ?? journey.proposal?.pantry_assumptions ?? [] };
        journey.choices = { items: replacements, pantry_assumptions: journey.choices!.pantry_assumptions };
      }
      snapshot ??= { items: payload.items.map(({ product, alternatives, ...item }) => ({ ...item, favorite_match: item.favorite_match ?? false, product: product.id, alternatives: alternatives?.map(({ id }) => id) ?? [] })), pantry_assumptions: payload.pantry_assumptions ?? [] };
      if (direction === "next") journey.previous = payload.presentation === "choices" ? "choices" : "proposal";
      return send(`Render review_proposed_basket using ${JSON.stringify({ presentation: target, ...snapshot, items: snapshot.items.map((item) => ({ ...item, confidence: item.confidence / 100 })), journey })}. ${payload.presentation === "choices" && direction === "next" ? "Use these replacement choices and keep every unchallenged selection unchanged. " : ""}${boundary}`);
    },
    sendSelections: (selections: readonly PickerSelection[]) => send(
      `Use these replacement choices and keep every unchallenged selection unchanged: ${JSON.stringify(selections)}. Show one complete final basket recap with review_proposed_basket in recap mode. Do not change the basket.`,
    ),
    sendApproval: (selections: readonly PickerSelection[]) => send(
      `I approve this exact final basket recap: ${JSON.stringify(selections)}. If I requested any change after this recap was shown, treat this card as obsolete and render a fresh complete recap instead of applying it. Otherwise continue through the protected exact basket-addition review and apply only this unchanged selection. Freshly validate before writing, do not retry an uncertain write, and show the basket readback.`,
    ),
    dispose: () => {
      active = false;
      if (host.ontoolresult === handleResult) host.ontoolresult = undefined;
      if (host.onhostcontextchanged === handleContext) host.onhostcontextchanged = undefined;
    },
  };
};
