import { createHash, randomUUID } from "node:crypto";
import type { Basket, Product } from "./client.js";
import { NemligError } from "./client.js";
import type { ShoppingClient } from "./cli.js";

export type ProposalOperation = "additions" | "removal" | "replacement" | "clear";

export interface ProposalAuditEvent {
  event: "created" | "invalidated" | "applying" | "completed" | "replayed" | "expired" | "indeterminate";
  operation: ProposalOperation;
  result: "prepared" | "rejected" | "started" | "verified" | "known-result" | "expired" | "uncertain";
}

export interface ProposalLine {
  product_id: number;
  name: string;
  unit_size: string;
  quantity: number;
  available: boolean;
  unit_price: number;
  line_total: number;
  labels: string[];
}

export interface ReplacementLine {
  product_id: number;
  name: string;
  unit: string;
  unit_size: string;
  quantity: number;
  available: boolean;
  item_price: number;
  unit_price: number | undefined;
  line_total: number;
  labels: string[];
}

interface AddOperation {
  kind: "additions";
  lines: ProposalLine[];
}

interface RemoveOperation {
  kind: "removal";
  productId: number;
  line: Basket["items"][number];
}

interface ReplacementOperation {
  kind: "replacement";
  currentProductId: number;
  current: ReplacementLine;
  replacement: ReplacementLine;
  expectedProductsPrice: number;
  expectedNumberOfProducts: number;
}

interface ClearOperation {
  kind: "clear";
  basket: Basket;
}

type Operation = AddOperation | RemoveOperation | ReplacementOperation | ClearOperation;
type ProposalState = "prepared" | "applying" | "completed" | "invalid" | "indeterminate";

export interface ProposalView extends Record<string, unknown> {
  applicable: true;
  proposal_id: string;
  operation: ProposalOperation;
  connection_bound: true;
  issued_at: string;
  expires_at: string;
  basket_fingerprint: string;
  review: Record<string, unknown>;
}

export interface NoopProposalView extends Record<string, unknown> {
  applicable: false;
  operation: "removal" | "replacement" | "clear";
  reason: string;
}

export interface ApplyResult extends Record<string, unknown> {
  status: "completed";
  operation: ProposalOperation;
  replayed: boolean;
  basket: Record<string, unknown>;
}

interface StoredProposal {
  id: string;
  connectionId: string;
  basketFingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
  operation: Operation;
  review: Record<string, unknown>;
  state: ProposalState;
  result?: ApplyResult;
}

export interface ProposalServiceOptions {
  now?: () => Date;
  id?: () => string;
  ttlMs?: number;
  audit?: (event: ProposalAuditEvent) => void;
}

const money = (value: number): number => Math.round(value * 100) / 100;
const sameId = (left: number | string | undefined, right: number): boolean =>
  left !== undefined && String(left) === String(right);

const basketPayload = (basket: Basket): Record<string, unknown> => ({
  items: basket.items,
  products_price: basket.productsPrice,
  delivery_price: basket.deliveryPrice,
  number_of_products: basket.numberOfProducts,
  delivery_time: basket.deliveryTime,
});

export const basketFingerprint = (basket: Basket): string => {
  const stable = {
    items: basket.items
      .map((item) => ({
        id: item.id ?? null,
        name: item.name ?? null,
        quantity: item.quantity ?? null,
        total: item.total ?? null,
      }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    productsPrice: basket.productsPrice ?? null,
    deliveryPrice: basket.deliveryPrice ?? null,
    numberOfProducts: basket.numberOfProducts ?? null,
    deliveryTime: basket.deliveryTime ?? null,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
};

const productLine = (product: Product, quantity: number): ProposalLine => {
  if (typeof product.id !== "number" || !product.name || product.price === undefined) {
    throw new NemligError("Product data is incomplete; no proposal was created.");
  }
  return {
    product_id: product.id,
    name: product.name,
    unit_size: product.unitSize,
    quantity,
    available: product.available,
    unit_price: product.price,
    line_total: money(product.price * quantity),
    labels: [...product.labels],
  };
};

const sameLine = (left: ProposalLine, right: ProposalLine): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const replacementLine = (product: Product, quantity: number, lineTotal?: number): ReplacementLine => {
  if (typeof product.id !== "number" || !product.name || product.price === undefined) {
    throw new NemligError("Product data is incomplete; no proposal was created.");
  }
  return {
    product_id: product.id,
    name: product.name,
    unit: product.unit,
    unit_size: product.unitSize,
    quantity,
    available: product.available,
    item_price: product.price,
    unit_price: product.unitPrice,
    line_total: money(lineTotal ?? product.price * quantity),
    labels: [...product.labels],
  };
};

const sameReplacementLine = (left: ReplacementLine, right: ReplacementLine): boolean =>
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
      "getProduct" | "getFreshProduct" | "getCart" | "addToCart" | "removeFromCart" | "clearCart"
    >,
    options: ProposalServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.id ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.audit = options.audit ?? (() => {});
    if (!Number.isFinite(this.ttlMs) || this.ttlMs < 1) throw new NemligError("Proposal TTL must be positive.");
  }

  async prepareAdditions(
    connectionId: string,
    items: Array<{ product_id: number; quantity: number }>,
  ): Promise<ProposalView> {
    if (!items.length) throw new NemligError("At least one product is required.");
    if (items.some((item) => !Number.isInteger(item.product_id) || item.product_id < 1)) {
      throw new NemligError("Product IDs must be positive integers.");
    }
    if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      throw new NemligError("Quantities must be positive integers.");
    }
    const ids = new Set(items.map((item) => item.product_id));
    if (ids.size !== items.length) throw new NemligError("Each product ID may appear only once per proposal.");
    const basket = await this.client.getCart();
    const lines = await Promise.all(
      items.map(async (item) => productLine(await this.client.getProduct(item.product_id), item.quantity)),
    );
    if (lines.some((line) => !line.available)) throw new NemligError("An exact product is unavailable; no proposal was created.");
    const currentTotal = basket.productsPrice ?? 0;
    const delta = lines.reduce((sum, line) => {
      const currentLine = basket.items.find((item) => sameId(item.id, line.product_id));
      return sum + line.line_total - (currentLine?.total ?? 0);
    }, 0);
    const currentCount = basket.numberOfProducts ?? 0;
    const countDelta = lines.reduce((sum, line) => {
      const currentLine = basket.items.find((item) => sameId(item.id, line.product_id));
      return sum + line.quantity - (currentLine?.quantity ?? 0);
    }, 0);
    return this.create(connectionId, basket, { kind: "additions", lines }, {
      lines,
      expected_products_price: money(currentTotal + delta),
      expected_number_of_products: currentCount + countDelta,
    });
  }

  async prepareRemoval(connectionId: string, productId: number): Promise<ProposalView | NoopProposalView> {
    if (!Number.isInteger(productId) || productId < 1) throw new NemligError("Product ID must be positive.");
    const basket = await this.client.getCart();
    const line = basket.items.find((item) => sameId(item.id, productId));
    if (!line) return { applicable: false, operation: "removal", reason: `Product ${productId} is not in the basket.` };
    return this.create(connectionId, basket, { kind: "removal", productId, line }, { line });
  }

  async prepareReplacement(
    connectionId: string,
    currentProductId: number,
    replacementProductId: number,
    replacementQuantity: number,
  ): Promise<ProposalView | NoopProposalView> {
    if (!Number.isInteger(currentProductId) || currentProductId < 1) {
      throw new NemligError("Current product ID must be positive.");
    }
    if (!Number.isInteger(replacementProductId) || replacementProductId < 1) {
      throw new NemligError("Replacement product ID must be positive.");
    }
    if (currentProductId === replacementProductId) {
      throw new NemligError("Current and replacement product IDs must differ.");
    }
    if (!Number.isInteger(replacementQuantity) || replacementQuantity < 1) {
      throw new NemligError("Replacement quantity must be positive.");
    }

    const basket = await this.client.getCart();
    const basketLine = basket.items.find((item) => sameId(item.id, currentProductId));
    if (!basketLine) {
      return {
        applicable: false,
        operation: "replacement",
        reason: `Product ${currentProductId} is not in the basket.`,
      };
    }
    const currentQuantity = basketLine.quantity;
    if (!Number.isInteger(currentQuantity) || currentQuantity === undefined || currentQuantity < 1 || basketLine.total === undefined) {
      throw new NemligError("Current basket line is incomplete; no proposal was created.");
    }

    const [currentProduct, replacementProduct] = await Promise.all([
      this.client.getProduct(currentProductId),
      this.client.getProduct(replacementProductId),
    ]);
    const current = replacementLine(currentProduct, currentQuantity, basketLine.total);
    const replacement = replacementLine(replacementProduct, replacementQuantity);
    if (!replacement.available) {
      throw new NemligError("The exact replacement product is unavailable; no proposal was created.");
    }

    const existingReplacement = basket.items.find((item) => sameId(item.id, replacementProductId));
    if (existingReplacement && (existingReplacement.total === undefined || existingReplacement.quantity === undefined)) {
      throw new NemligError("Existing replacement basket line is incomplete; no proposal was created.");
    }
    if (basket.productsPrice === undefined && basket.items.some((item) => item.total === undefined)) {
      throw new NemligError("Current basket totals are incomplete; no proposal was created.");
    }
    if (basket.numberOfProducts === undefined && basket.items.some((item) => item.quantity === undefined)) {
      throw new NemligError("Current basket quantities are incomplete; no proposal was created.");
    }
    const currentProductsPrice = basket.productsPrice ?? basket.items.reduce((sum, item) => sum + (item.total ?? 0), 0);
    const currentCount = basket.numberOfProducts ?? basket.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
    const expectedProductsPrice = money(
      currentProductsPrice - current.line_total - (existingReplacement?.total ?? 0) + replacement.line_total,
    );
    const expectedCount = currentCount - current.quantity - (existingReplacement?.quantity ?? 0) + replacement.quantity;
    const priceDifference = money(currentProductsPrice - expectedProductsPrice);
    return this.create(connectionId, basket, {
      kind: "replacement",
      currentProductId,
      current,
      replacement,
      expectedProductsPrice,
      expectedNumberOfProducts: expectedCount,
    }, {
      current_line: current,
      replacement_line: replacement,
      existing_replacement_line: existingReplacement ?? null,
      current_products_price: money(currentProductsPrice),
      expected_products_price: expectedProductsPrice,
      expected_number_of_products: expectedCount,
      price_difference: priceDifference,
      ...(priceDifference > 0 ? { potential_savings: priceDifference } : {}),
    });
  }

  async prepareClear(connectionId: string): Promise<ProposalView | NoopProposalView> {
    const basket = await this.client.getCart();
    if (!basket.items.length) return { applicable: false, operation: "clear", reason: "The basket is already empty." };
    return this.create(connectionId, basket, { kind: "clear", basket }, { basket: basketPayload(basket) });
  }

  apply(connectionId: string, proposalId: string, expected: ProposalOperation): Promise<ApplyResult> {
    return this.mutex.run(async () => {
      const proposal = this.proposals.get(proposalId);
      if (!proposal) throw new NemligError("Proposal not found; prepare and review a new proposal.");
      if (proposal.connectionId !== connectionId) throw new NemligError("Proposal belongs to another connection.");
      if (proposal.operation.kind !== expected) throw new NemligError("Proposal operation does not match this apply tool.");
      if (proposal.state === "completed" && proposal.result) {
        this.record("replayed", proposal.operation.kind, "known-result");
        return { ...proposal.result, replayed: true };
      }
      if (proposal.state !== "prepared") throw new NemligError("Proposal is no longer applicable; prepare a new proposal.");
      if (this.now().getTime() >= proposal.expiresAt.getTime()) {
        proposal.state = "invalid";
        this.record("expired", proposal.operation.kind, "expired");
        throw new NemligError("Proposal expired; prepare and review a new proposal.");
      }

      const basket = await this.client.getCart();
      if (basketFingerprint(basket) !== proposal.basketFingerprint) {
        proposal.state = "invalid";
        this.record("invalidated", proposal.operation.kind, "rejected");
        throw new NemligError("Basket changed after review; prepare and review a new proposal.");
      }
      if (proposal.operation.kind === "additions") {
        try {
          for (const reviewed of proposal.operation.lines) {
            const current = productLine(await this.client.getFreshProduct(reviewed.product_id), reviewed.quantity);
            if (!sameLine(current, reviewed)) {
              proposal.state = "invalid";
              this.record("invalidated", proposal.operation.kind, "rejected");
              throw new NemligError("Product details changed after review; prepare and review a new proposal.");
            }
          }
        } catch (error) {
          if (proposal.state === "invalid") throw error;
          proposal.state = "invalid";
          this.record("invalidated", proposal.operation.kind, "rejected");
          throw new NemligError("Current product details could not be revalidated; prepare and review a new proposal.");
        }
      } else if (proposal.operation.kind === "replacement") {
        const operation = proposal.operation;
        const currentBasketLine = basket.items.find((item) => sameId(item.id, operation.currentProductId));
        if (!currentBasketLine?.quantity || currentBasketLine.total === undefined) {
          proposal.state = "invalid";
          this.record("invalidated", proposal.operation.kind, "rejected");
          throw new NemligError("Current basket line changed after review; prepare and review a new proposal.");
        }
        let current: Product;
        let replacement: Product;
        try {
          [current, replacement] = await Promise.all([
            this.client.getFreshProduct(operation.current.product_id),
            this.client.getFreshProduct(operation.replacement.product_id),
          ]);
        } catch {
          proposal.state = "invalid";
          this.record("invalidated", proposal.operation.kind, "rejected");
          throw new NemligError("Current product details could not be revalidated; prepare and review a new proposal.");
        }
        if (
          !sameReplacementLine(
            replacementLine(current, currentBasketLine.quantity, currentBasketLine.total),
            operation.current,
          ) ||
          !sameReplacementLine(
            replacementLine(replacement, operation.replacement.quantity),
            operation.replacement,
          )
        ) {
          proposal.state = "invalid";
          this.record("invalidated", proposal.operation.kind, "rejected");
          throw new NemligError("Replacement details changed after review; prepare and review a new proposal.");
        }
      }

      proposal.state = "applying";
      this.record("applying", proposal.operation.kind, "started");
      let replacementVerified = false;
      try {
        let result: Basket;
        if (proposal.operation.kind === "additions") {
          result = basket;
          for (const line of proposal.operation.lines) {
            result = await this.client.addToCart(line.product_id, line.quantity);
          }
          for (const line of proposal.operation.lines) {
            const applied = result.items.find((item) => sameId(item.id, line.product_id));
            if (applied?.quantity !== line.quantity || money(applied.total ?? Number.NaN) !== line.line_total) {
              throw new NemligError("Basket readback did not match the approved additions.");
            }
          }
        } else if (proposal.operation.kind === "removal") {
          const { productId } = proposal.operation;
          result = await this.client.removeFromCart(productId);
          if (result.items.some((item) => sameId(item.id, productId))) {
            throw new NemligError("Basket readback still contains the approved removal.");
          }
        } else if (proposal.operation.kind === "replacement") {
          const { currentProductId, replacement, expectedProductsPrice, expectedNumberOfProducts } = proposal.operation;
          result = await this.client.addToCart(replacement.product_id, replacement.quantity);
          const applied = result.items.find((item) => sameId(item.id, replacement.product_id));
          if (applied?.quantity !== replacement.quantity || money(applied.total ?? Number.NaN) !== replacement.line_total) {
            throw new NemligError("Basket readback did not match the approved replacement.");
          }
          replacementVerified = true;
          result = await this.client.removeFromCart(currentProductId);
          if (
            result.items.some((item) => sameId(item.id, currentProductId)) ||
            money(result.productsPrice ?? Number.NaN) !== expectedProductsPrice ||
            result.numberOfProducts !== expectedNumberOfProducts
          ) {
            throw new NemligError("Final basket readback did not match the approved replacement.");
          }
        } else {
          result = await this.client.clearCart();
          if (result.items.length) throw new NemligError("Basket readback is not empty after clear.");
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
      } catch {
        proposal.state = "indeterminate";
        this.record("indeterminate", proposal.operation.kind, "uncertain");
        if (proposal.operation.kind === "replacement") {
          throw new NemligError(
            replacementVerified
              ? "Replacement was added, but the old product may remain; inspect the basket and do not retry this proposal."
              : "Basket may have changed, but the old product was not intentionally removed; inspect the basket and do not retry this proposal.",
          );
        }
        throw new NemligError("Basket may have changed but verification did not complete; inspect the basket and do not retry this proposal.");
      }
    });
  }

  private create(
    connectionId: string,
    basket: Basket,
    operation: Operation,
    review: Record<string, unknown>,
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
