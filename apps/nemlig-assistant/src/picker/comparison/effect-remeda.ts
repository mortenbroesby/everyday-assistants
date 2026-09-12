import { Effect, Exit, Scope } from "effect";
import { filter, map, pipe } from "remeda";
import { safePickerImageUrl, type PickerPayload } from "../contract.js";
import {
  comparisonChoiceMessage,
  type ComparisonCandidate,
  type ComparisonProduct,
} from "./types.js";

const toProduct = (product: PickerPayload["items"][number]["product"]): ComparisonProduct => ({
  id: product.id,
  name: product.name ?? "Ukendt vare",
  available: product.available,
  imageUrl: safePickerImageUrl(product.image_url),
});

export const effectRemedaCandidate: ComparisonCandidate = {
  id: "effect-remeda",
  name: "Remeda + Effect",
  derive: (payload) => ({
    pantry: payload.pantry_assumptions ?? [],
    rejected: map(payload.rejected ?? [], ({ ingredient }) => ingredient),
    items: map(payload.items, (item, itemIndex) => ({
      ingredient: item.ingredient,
      quantity: item.quantity,
      confidence: item.confidence,
      favoriteMatch: item.favorite_match ?? false,
      proposed: toProduct(item.product),
      alternatives: pipe(
        item.alternatives ?? [],
        filter(({ available }) => available),
        map((product) => ({ ...toProduct(product), choice: `${itemIndex}:${product.id}` })),
      ),
    })),
  }),
  createSession: (host, emit) => {
    let active = true;
    let generation = 0;
    let pending = false;
    const scope = Effect.runSync(Scope.make());

    Effect.runSync(Scope.addFinalizer(scope, Effect.sync(() => {
      if (!active) return;
      active = false;
      generation += 1;
      pending = false;
      emit({ status: "disposed" });
    })));

    return {
      choose: async (choice) => {
        if (!active || pending) return;
        pending = true;
        const currentGeneration = generation;
        emit({ status: "pending", choice: choice.key });

        const result = await Effect.runPromise(Effect.either(Effect.tryPromise({
          try: () => host.sendMessage(comparisonChoiceMessage(choice)),
          catch: () => ({ type: "send-failed" as const }),
        })));

        if (!active || currentGeneration !== generation) return;
        pending = false;
        emit({
          status: result._tag === "Left" ? "error" : "selected",
          choice: choice.key,
        });
      },
      replace: () => {
        if (!active) return;
        generation += 1;
        pending = false;
        emit({ status: "idle" });
      },
      dispose: () => {
        Effect.runSync(Scope.close(scope, Exit.succeed(undefined)));
      },
    };
  },
};
