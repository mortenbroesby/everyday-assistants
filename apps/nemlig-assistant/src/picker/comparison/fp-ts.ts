import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";
import { safePickerImageUrl, type PickerPayload } from "../contract.js";
import {
  comparisonChoiceMessage,
  type ComparisonCandidate,
  type ComparisonProduct,
} from "./types.js";

const toProduct = (product: PickerPayload["items"][number]["product"]): ComparisonProduct => ({
  id: product.id,
  name: pipe(product.name, O.fromNullable, O.getOrElse(() => "Ukendt vare")),
  available: product.available,
  imageUrl: safePickerImageUrl(product.image_url),
});

export const fpTsCandidate: ComparisonCandidate = {
  id: "fp-ts",
  name: "fp-ts",
  derive: (payload) => ({
    pantry: payload.pantry_assumptions ?? [],
    rejected: pipe(payload.rejected ?? [], RA.map(({ ingredient }) => ingredient)),
    items: pipe(payload.items, RA.mapWithIndex((itemIndex, item) => ({
      ingredient: item.ingredient,
      quantity: item.quantity,
      confidence: item.confidence,
      favoriteMatch: item.favorite_match ?? false,
      proposed: toProduct(item.product),
      alternatives: pipe(
        item.alternatives ?? [],
        RA.filter(({ available }) => available),
        RA.map((product) => ({ ...toProduct(product), choice: `${itemIndex}:${product.id}` })),
      ),
    }))),
  }),
  createSession: (host, emit) => {
    let active = true;
    let generation = 0;
    let pending = false;

    return {
      choose: async (choice) => {
        if (!active || pending) return;
        pending = true;
        const currentGeneration = generation;
        emit({ status: "pending", choice: choice.key });

        const result = await pipe(
          TE.tryCatch(
            () => host.sendMessage(comparisonChoiceMessage(choice)),
            () => ({ type: "send-failed" as const }),
          ),
        )();

        if (!active || currentGeneration !== generation) return;
        pending = false;
        pipe(
          result,
          E.match(
            () => emit({ status: "error", choice: choice.key }),
            () => emit({ status: "selected", choice: choice.key }),
          ),
        );
      },
      replace: () => {
        if (!active) return;
        generation += 1;
        pending = false;
        emit({ status: "idle" });
      },
      dispose: () => {
        if (!active) return;
        active = false;
        generation += 1;
        pending = false;
        emit({ status: "disposed" });
      },
    };
  },
};
