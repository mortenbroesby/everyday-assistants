import type { PickerPayload } from "../contract.js";

export type ComparisonChoice = Readonly<{
  id: number;
  ingredient: string;
  key: string;
}>;

export type ComparisonProduct = Readonly<{
  available: boolean;
  id: number;
  imageUrl?: string;
  name: string;
}>;

export type ComparisonItem = Readonly<{
  alternatives: readonly (ComparisonProduct & { choice: string })[];
  confidence: number;
  favoriteMatch: boolean;
  ingredient: string;
  proposed: ComparisonProduct;
  quantity: number;
}>;

export type ComparisonDisplayModel = Readonly<{
  items: readonly ComparisonItem[];
  pantry: readonly string[];
  rejected: readonly string[];
}>;

export type ComparisonStatus = "idle" | "pending" | "selected" | "error" | "disposed";

export type ComparisonState = Readonly<{
  choice?: string;
  status: ComparisonStatus;
}>;

export type ComparisonMessage = Readonly<{
  role: "user";
  content: readonly [Readonly<{ type: "text"; text: string }>];
}>;

export type ComparisonHost = Readonly<{
  sendMessage(message: ComparisonMessage): Promise<unknown>;
}>;

export type ComparisonSession = Readonly<{
  choose(choice: ComparisonChoice): Promise<void>;
  dispose(): void;
  replace(): void;
}>;

export type ComparisonCandidate = Readonly<{
  createSession(host: ComparisonHost, emit: (state: ComparisonState) => void): ComparisonSession;
  derive(payload: PickerPayload): ComparisonDisplayModel;
  id: "fp-ts" | "effect-remeda";
  name: "fp-ts" | "Remeda + Effect";
}>;

export const comparisonChoiceMessage = ({ id, ingredient }: ComparisonChoice): ComparisonMessage => ({
  role: "user",
  content: [{ type: "text", text: `Choose product ${id} for ${ingredient} instead.` }],
});
