import { createHash, randomUUID } from "node:crypto";
import type { Basket, Product } from "./client.js";
import { NemligError } from "./client.js";
import type { ShoppingClient } from "./cli.js";

export type ProposalOperation = "additions" | "removal" | "clear";

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

interface AddOperation {
  kind: "additions";
  lines: ProposalLine[];
}

interface RemoveOperation {
  kind: "removal";
  productId: number;
  line: Basket["items"][number];
}

interface ClearOperation {
  kind: "clear";
  basket: Basket;
}

type Operation = AddOperation | RemoveOperation | ClearOperation;
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
  operation: "removal" | "clear";
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
      "getProduct" | "getCart" | "addToCart" | "removeFromCart" | "clearCart"
    >,
    options: ProposalServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.id ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 2 * 60 * 1000;
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
        for (const reviewed of proposal.operation.lines) {
          const current = productLine(await this.client.getProduct(reviewed.product_id), reviewed.quantity);
          if (!sameLine(current, reviewed)) {
            proposal.state = "invalid";
            this.record("invalidated", proposal.operation.kind, "rejected");
            throw new NemligError("Product details changed after review; prepare and review a new proposal.");
          }
        }
      }

      proposal.state = "applying";
      this.record("applying", proposal.operation.kind, "started");
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
