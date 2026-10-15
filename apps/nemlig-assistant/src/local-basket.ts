export class LocalBasketOperationCapacityError extends Error {
  override readonly name = "LocalBasketOperationCapacityError";
  // Preserve this code when Durable Object RPC reconstructs the error.
  readonly code = "LOCAL_BASKET_OPERATION_CAPACITY";

  constructor() {
    super(
      "Shopping-list recovery storage is full. This Save or Update did not reach Nemlig; use an existing list and do not retry an uncertain Save.",
    );
  }
}

type LocalBasketFailureCode = "LOCAL_BASKET_OPERATION_CAPACITY";

/** Read the stable own-field code preserved when a DO RPC error is reconstructed. */
export const serializedLocalBasketFailureCode = (
  error: unknown,
): LocalBasketFailureCode | undefined => {
  if (error instanceof LocalBasketOperationCapacityError) {
    return error.code;
  }
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "LOCAL_BASKET_OPERATION_CAPACITY"
    ? error.code
    : undefined;
};

export interface ReviewOperation {
  operationId: string;
  generation: string;
  accountIdentity: string;
  kind: "save" | "update" | "submit" | "basket-save";
  name: string;
  createAttempted?: boolean;
  dispatchAttempted?: boolean;
  completed?: boolean;
  cleanupStatus?: "pending" | "deleted" | "retained" | "uncertain";
  cleanupWarning?: string;
  listId?: number;
  items: Array<{ productId: number; quantity: number }>;
  baseline?: Array<{ productId: number; quantity: number }>;
  progress?: { completed: number; total: number };
  createdAt?: number;
  completedUntil?: number;
}

export type LocalBasketCommand =
  | { kind: "review-operation-read"; operationId: string }
  | {
      kind: "review-operation-claim";
      operationId: string;
      generation: string;
    }
  | {
      kind: "review-operation-release";
      operationId: string;
      generation: string;
    }
  | { kind: "review-operation-write"; operation: ReviewOperation }
  | {
      kind: "review-operation-complete";
      operationId: string;
      generation: string;
    };
