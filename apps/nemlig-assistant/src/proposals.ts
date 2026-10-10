import { randomUUID } from "node:crypto";
import {
  BasketPreflightError,
  basketFingerprint,
  BasketSnapshotChangedError,
  NemligError,
  type Basket,
  type Product,
  type ShoppingClient,
} from "./client.js";
export { basketFingerprint } from "./client.js";
import { runReadPool } from "./read-coordination.js";

export type ProposalOperation = "additions";
export type AdditionAuthorization = { kind: "exact_review" };

export interface ProposalAuditEvent {
  event:
    | "created"
    | "invalidated"
    | "applying"
    | "completed"
    | "replayed"
    | "expired"
    | "indeterminate"
    | "partial";
  operation: ProposalOperation;
  result:
    | "prepared"
    | "rejected"
    | "started"
    | "verified"
    | "known-result"
    | "expired"
    | "uncertain"
    | "verified-partial";
}

export interface ProposalLine {
  product_id: number;
  name: string;
  unit_size: string;
  category: string;
  subcategory: string;
  /** Number of additional units explicitly requested. */
  quantity: number;
  current_quantity: number;
  resulting_quantity: number;
  current_line_total: number;
  resulting_line_total: number;
  available: boolean;
  item_price: number;
  unit_price: number | undefined;
  unit: string;
  currency: "DKK";
  line_total: number;
  labels: string[];
}

interface AddOperation {
  kind: "additions";
  lines: ProposalLine[];
}
type Operation = AddOperation;
type ProposalState =
  | "prepared"
  | "applying"
  | "completed"
  | "invalid"
  | "indeterminate"
  | "partial";

export interface ProposalView extends Record<string, unknown> {
  applicable: true;
  proposal_id: string;
  operation: ProposalOperation;
  connection_bound: true;
  issued_at: string;
  expires_at: string;
  basket_fingerprint: string;
  review: Record<string, unknown>;
  authorization?: "exact_review";
}

export interface ApplyResult extends Record<string, unknown> {
  status: "completed";
  operation: ProposalOperation;
  replayed: boolean;
  basket: BasketPayload;
}

/** A preflight stopped a batch after earlier additions had verified readback. */
export class VerifiedPartialAdditionsError extends NemligError {
  override readonly name = "VerifiedPartialAdditionsError";

  constructor(
    readonly verifiedAdditions: number,
    message: string,
  ) {
    super(message);
  }
}

export interface BasketPayload extends Record<string, unknown> {
  items: Basket["items"];
  products_price: number | undefined;
  delivery_price: number | undefined;
  number_of_products: number | undefined;
  delivery_time: string | undefined;
}

interface StoredProposal {
  id: string;
  connectionId: string;
  basketFingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
  operation: Operation;
  review: Record<string, unknown>;
  authorization?: "exact_review";
  state: ProposalState;
  result?: ApplyResult;
}

export interface ProposalServiceOptions {
  now?: () => Date;
  id?: () => string;
  ttlMs?: number;
  audit?: (event: ProposalAuditEvent) => void;
}

export interface ProposalReadOptions {
  readonly signal?: AbortSignal;
}

const money = (value: number): number => Math.round(value * 100) / 100;
const sameId = (left: number | string | undefined, right: number): boolean =>
  left !== undefined && String(left) === String(right);

export const basketPayload = (basket: Basket): BasketPayload => ({
  items: basket.items,
  products_price: basket.productsPrice,
  delivery_price: basket.deliveryPrice,
  number_of_products: basket.numberOfProducts,
  delivery_time: basket.deliveryTime,
});

const productLine = (product: Product, quantity: number): ProposalLine => {
  if (
    typeof product.id !== "number" ||
    !product.name ||
    product.price === undefined
  ) {
    throw new NemligError(
      "Product data is incomplete; no proposal was created.",
    );
  }
  if (product.available === undefined) {
    throw new NemligError(
      "Product availability could not be confirmed; no proposal was created.",
    );
  }
  return {
    product_id: product.id,
    name: product.name,
    unit_size: product.unitSize,
    category: product.category,
    subcategory: product.subcategory,
    quantity,
    current_quantity: 0,
    resulting_quantity: quantity,
    current_line_total: 0,
    resulting_line_total: money(product.price * quantity),
    available: product.available,
    item_price: product.price,
    unit_price: product.unitPrice,
    unit: product.unit,
    currency: "DKK",
    line_total: money(product.price * quantity),
    labels: [...product.labels],
  };
};

const sameLine = (left: ProposalLine, right: ProposalLine): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = (): void => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }
}

export class BasketProposalService {
  private readonly proposals = new Map<string, StoredProposal>();
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly ttlMs: number;
  private readonly audit: (event: ProposalAuditEvent) => void;
  private readonly mutex = new Mutex();

  constructor(
    private readonly client: Pick<
      ShoppingClient,
      "getProduct" | "getFreshProduct" | "getCart" | "addToCart"
    >,
    options: ProposalServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.id ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.audit = options.audit ?? (() => {});
    if (!Number.isFinite(this.ttlMs) || this.ttlMs < 1) {
      throw new NemligError("Proposal TTL must be positive.");
    }
  }

  /** Builds an additions review without mutation. */
  async prepareAdditions(
    connectionId: string,
    items: Array<{ product_id: number; quantity: number }>,
    authorization: AdditionAuthorization,
    options: ProposalReadOptions & { freshProducts?: boolean } = {},
  ): Promise<ProposalView> {
    this.validateAdditionItems(items);
    if (!authorization || authorization.kind !== "exact_review") {
      throw new NemligError("A valid additions authorization is required.");
    }
    const basket = await this.client.getCart(options.signal);
    const basketLines = this.validateAdditionBasket(basket, items);
    const lines = await runReadPool(
      items,
      async (item, signal) =>
        productLine(
          await (options.freshProducts
            ? this.client.getFreshProduct(item.product_id, signal)
            : this.client.getProduct(item.product_id, signal)),
          item.quantity,
        ),
      options,
    );
    if (lines.some((line) => !line.available)) {
      throw new NemligError(
        "An exact product is unavailable; no proposal was created.",
      );
    }
    const reviewedLines = lines.map((line) => {
      const existing = basketLines.get(String(line.product_id));
      return {
        ...line,
        current_quantity: existing?.quantity ?? 0,
        resulting_quantity: (existing?.quantity ?? 0) + line.quantity,
        current_line_total: money(existing?.total ?? 0),
        resulting_line_total: money((existing?.total ?? 0) + line.line_total),
      };
    });
    const totals = lines.reduce(
      (result, line) => ({
        price: result.price + line.line_total,
        count: result.count + line.quantity,
      }),
      { price: basket.productsPrice!, count: basket.numberOfProducts! },
    );
    return this.create(
      connectionId,
      basket,
      { kind: "additions", lines },
      {
        lines: reviewedLines,
        expected_products_price: money(totals.price),
        expected_number_of_products: totals.count,
      },
      authorization.kind,
    );
  }

  private validateAdditionItems(
    items: Array<{ product_id: number; quantity: number }>,
  ): void {
    if (!items.length) {
      throw new NemligError("At least one product is required.");
    }
    if (
      items.some(
        (item) => !Number.isInteger(item.product_id) || item.product_id < 1,
      )
    ) {
      throw new NemligError("Product IDs must be positive integers.");
    }
    if (
      items.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity < 1,
      )
    ) {
      throw new NemligError("Quantities must be positive integers.");
    }
    const ids = new Set(items.map((item) => item.product_id));
    if (ids.size !== items.length) {
      throw new NemligError(
        "Each product ID may appear only once per proposal.",
      );
    }
  }

  private validateAdditionBasket(
    basket: Basket,
    items: Array<{ product_id: number; quantity: number }>,
  ): Map<string, Basket["items"][number]> {
    if (
      !Number.isFinite(basket.productsPrice) ||
      basket.productsPrice! < 0 ||
      !Number.isSafeInteger(basket.numberOfProducts) ||
      basket.numberOfProducts! < 0
    ) {
      throw new NemligError(
        "Nemlig basket totals are incomplete; no proposal was created.",
      );
    }
    const basketLines = new Map<string, Basket["items"][number]>();
    for (const line of basket.items) {
      if (
        !Number.isSafeInteger(line.id) ||
        line.id! < 1 ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity! < 0
      ) {
        throw new NemligError(
          "Nemlig basket lines are incomplete; no proposal was created.",
        );
      }
      const id = String(line.id);
      if (basketLines.has(id)) {
        throw new NemligError(
          "Nemlig basket contains duplicate product lines; no proposal was created.",
        );
      }
      basketLines.set(id, line);
    }
    for (const item of items) {
      const existing = basketLines.get(String(item.product_id));
      if (
        existing &&
        (!Number.isFinite(existing.total) || existing.total! < 0)
      ) {
        throw new NemligError(
          "A matching Nemlig basket line is incomplete; no proposal was created.",
        );
      }
    }
    return basketLines;
  }
  /**
   * Applies one exact, connection-bound, unexpired review under a mutex. It
   * checks the basket fingerprint and fresh product details before sequential
   * writes, verifies final readback, and never retries an indeterminate result.
   */
  apply(
    connectionId: string,
    proposalId: string,
    expected: ProposalOperation,
  ): Promise<ApplyResult> {
    return this.mutex.run(async () => {
      const proposal = this.proposals.get(proposalId);
      if (!proposal) {
        throw new NemligError(
          "Proposal not found; prepare and review a new proposal.",
        );
      }
      if (proposal.connectionId !== connectionId) {
        throw new NemligError("Proposal belongs to another connection.");
      }
      if (proposal.operation.kind !== expected) {
        throw new NemligError(
          "Proposal operation does not match this apply tool.",
        );
      }
      if (proposal.state === "completed" && proposal.result) {
        this.record("replayed", proposal.operation.kind, "known-result");
        return { ...proposal.result, replayed: true };
      }
      if (proposal.state !== "prepared") {
        throw new NemligError(
          "Proposal is no longer applicable; prepare a new proposal.",
        );
      }
      if (this.now().getTime() >= proposal.expiresAt.getTime()) {
        proposal.state = "invalid";
        this.record("expired", proposal.operation.kind, "expired");
        throw new NemligError(
          "Proposal expired; prepare and review a new proposal.",
        );
      }

      let basket: Basket;
      try {
        basket = await this.client.getCart();
      } catch {
        this.invalidate(proposal);
        throw new NemligError(
          "Current basket could not be revalidated; no provider write was sent. Prepare and review a new proposal.",
        );
      }
      if (basketFingerprint(basket) !== proposal.basketFingerprint) {
        this.invalidate(proposal);
        throw new NemligError(
          "Basket changed after review; prepare and review a new proposal.",
        );
      }
      let verifiedAdditions = 0;
      try {
        for (const reviewed of proposal.operation.lines) {
          const current = productLine(
            await this.client.getFreshProduct(reviewed.product_id),
            reviewed.quantity,
          );
          if (!sameLine(current, reviewed)) {
            proposal.state = "invalid";
            this.record("invalidated", proposal.operation.kind, "rejected");
            throw new NemligError(
              "Product details changed after review; prepare and review a new proposal.",
            );
          }
        }
      } catch (error) {
        if (proposal.state === "invalid") {
          throw error;
        }
        this.invalidate(proposal);
        throw new NemligError(
          "Current product details could not be revalidated; prepare and review a new proposal.",
        );
      }
      const approvedLineTotals = new Map<string, number>();
      for (const line of basket.items) {
        if (!Number.isFinite(line.total) || line.total! < 0) {
          this.invalidate(proposal);
          throw new NemligError(
            "Current basket prices are incomplete; no provider write was sent.",
          );
        }
        approvedLineTotals.set(String(line.id), money(line.total!));
      }

      proposal.state = "applying";
      this.record("applying", proposal.operation.kind, "started");
      try {
        let result: Basket;
        result = basket;
        let approvedTotal = basket.productsPrice!;
        let expectedProducts = basket.numberOfProducts!;
        for (const line of proposal.operation.lines) {
          approvedTotal = money(approvedTotal + line.line_total);
          expectedProducts += line.quantity;
          const previousLine = result.items.find((item) =>
            sameId(item.id, line.product_id),
          );
          const expectedQuantity =
            (previousLine?.quantity ?? 0) + line.quantity;
          const lineId = String(line.product_id);
          const approvedLineTotal = money(
            (approvedLineTotals.get(lineId) ?? 0) + line.line_total,
          );
          approvedLineTotals.set(lineId, approvedLineTotal);
          const previousLines = result.items;
          result = await this.client.addToCart(
            line.product_id,
            line.quantity,
            result,
          );
          const applied = result.items.find((item) =>
            sameId(item.id, line.product_id),
          );
          if (applied?.quantity !== expectedQuantity) {
            throw new NemligError(
              "Basket readback did not match the approved additive quantity.",
            );
          }
          for (const previous of previousLines) {
            const preserved = result.items.find(
              (item) => String(item.id) === String(previous.id),
            );
            const expectedPreviousQuantity = sameId(
              previous.id,
              line.product_id,
            )
              ? expectedQuantity
              : previous.quantity;
            if (!preserved || preserved.quantity !== expectedPreviousQuantity) {
              throw new NemligError(
                "Basket readback did not preserve every previously verified line.",
              );
            }
          }
          if (result.items.length !== approvedLineTotals.size) {
            throw new NemligError(
              "Basket readback contained an unexpected product line.",
            );
          }
          for (const current of result.items) {
            const ceiling = approvedLineTotals.get(String(current.id));
            if (
              ceiling === undefined ||
              !Number.isFinite(current.total) ||
              current.total! < 0 ||
              money(current.total!) > ceiling
            ) {
              throw new NemligError(
                "Basket line price exceeded the reviewed amount or was incomplete.",
              );
            }
          }
          const actualProductsPrice = result.productsPrice ?? Number.NaN;
          if (
            !Number.isFinite(actualProductsPrice) ||
            actualProductsPrice < 0 ||
            money(actualProductsPrice) > approvedTotal ||
            result.numberOfProducts !== expectedProducts
          ) {
            throw new NemligError(
              "Basket total or product count exceeded the approved additions.",
            );
          }
          verifiedAdditions += 1;
        }
        const completed: ApplyResult = {
          status: "completed",
          operation: proposal.operation.kind,
          replayed: false,
          basket: basketPayload(result),
        };
        proposal.state = "completed";
        proposal.result = completed;
        this.record("completed", proposal.operation.kind, "verified");
        return completed;
      } catch (error) {
        if (error instanceof BasketPreflightError && verifiedAdditions === 0) {
          this.invalidate(proposal);
          const detail =
            error instanceof BasketSnapshotChangedError
              ? "Basket changed before an addition"
              : "A required basket preflight failed";
          throw new NemligError(
            `${detail}; no provider write was sent. Prepare and review a new proposal.`,
          );
        }
        if (error instanceof BasketPreflightError) {
          proposal.state = "partial";
          this.record("partial", proposal.operation.kind, "verified-partial");
          const detail =
            error instanceof BasketSnapshotChangedError
              ? "the basket changed before the next write"
              : "the next write failed its basket preflight";
          const verifiedNames = proposal.operation.lines
            .slice(0, verifiedAdditions)
            .map(({ name }) => name)
            .join(", ");
          throw new VerifiedPartialAdditionsError(
            verifiedAdditions,
            `Earlier verified additions: ${verifiedNames}. ${detail}; no later write was sent. Inspect the basket and prepare a new proposal only after reconciling it.`,
          );
        }
        proposal.state = "indeterminate";
        this.record("indeterminate", proposal.operation.kind, "uncertain");
        throw new NemligError(
          "Basket may have changed but verification did not complete; inspect the basket and do not retry this proposal.",
        );
      }
    });
  }

  private invalidate(proposal: StoredProposal): void {
    proposal.state = "invalid";
    this.record("invalidated", proposal.operation.kind, "rejected");
  }

  private create(
    connectionId: string,
    basket: Basket,
    operation: Operation,
    review: Record<string, unknown>,
    authorization?: "exact_review",
  ): ProposalView {
    const issuedAt = this.now();
    const proposal: StoredProposal = {
      id: this.createId(),
      connectionId,
      basketFingerprint: basketFingerprint(basket),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + this.ttlMs),
      operation,
      review,
      authorization,
      state: "prepared",
    };
    this.proposals.set(proposal.id, proposal);
    this.record("created", operation.kind, "prepared");
    return {
      applicable: true,
      proposal_id: proposal.id,
      operation: operation.kind,
      connection_bound: true,
      issued_at: proposal.issuedAt.toISOString(),
      expires_at: proposal.expiresAt.toISOString(),
      basket_fingerprint: proposal.basketFingerprint,
      ...(proposal.authorization
        ? { authorization: proposal.authorization }
        : {}),
      review,
    };
  }

  private record(
    event: ProposalAuditEvent["event"],
    operation: ProposalOperation,
    result: ProposalAuditEvent["result"],
  ): void {
    this.audit({ event, operation, result });
  }
}
