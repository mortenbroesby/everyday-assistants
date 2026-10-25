export type NemligFailureCategory =
  | "http"
  | "network"
  | "timeout"
  | "cancelled"
  | "invalid_response"
  | "readback_mismatch";

export interface BasketAdditionFailure {
  stage: "dispatch" | "readback";
  category: NemligFailureCategory;
  httpStatus: number | null;
  validationFailuresPresent?: true;
}

export class NemligError extends Error {
  override readonly name: string = "NemligError";

  constructor(
    message: string,
    readonly status?: number,
    readonly category?: NemligFailureCategory,
  ) {
    super(message);
  }
}

/** Safe diagnostic facts only; never retain provider bodies, credentials or causes. */
export class BasketAdditionError extends NemligError {
  override readonly name = "BasketAdditionError";
  readonly failure: BasketAdditionFailure;

  constructor(message: string, failure: BasketAdditionFailure) {
    const httpStatus =
      Number.isInteger(failure.httpStatus) &&
      failure.httpStatus !== null &&
      failure.httpStatus >= 100 &&
      failure.httpStatus <= 599
        ? failure.httpStatus
        : null;
    super(message, httpStatus ?? undefined, failure.category);
    this.failure = {
      stage: failure.stage,
      category: failure.category,
      httpStatus,
      ...(failure.validationFailuresPresent === true
        ? { validationFailuresPresent: true as const }
        : {}),
    };
  }
}
