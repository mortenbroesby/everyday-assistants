import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse, type IncomingMessage } from "node:http";
import { type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { type Basket, type Product } from "../src/client.js";
import { type ProductDiscoveryClient } from "../src/product-discovery.js";
import { createProgram } from "../src/cli.js";
import { type ShoppingPlan } from "../src/plans.js";

type Scenario = "success" | "basket-failure" | "caller-cancellation";
type Timer = ReturnType<typeof setTimeout>;

interface RequestRecord {
  readonly kind: "basket" | "catalogue";
  readonly startedAt: number;
  requestEnded: boolean;
  responseClosed: boolean;
  completed: boolean;
  aborted: boolean;
}

interface HarnessMetrics {
  readonly requests: RequestRecord[];
  catalogueStarted: number;
  catalogueActive: number;
  maximumCatalogueActive: number;
  clientOutstanding: number;
  clientSettled: number;
  fatalAt?: number;
  cancellationAt?: number;
}

interface LoopbackHarness {
  readonly metrics: HarnessMetrics;
  readonly client: ProductDiscoveryClient;
  waitForCatalogueStarts(count: number): Promise<void>;
  waitForQuiescence(): Promise<void>;
  close(): Promise<void>;
}

interface ScenarioSummary {
  readonly initialCatalogueRequests?: number;
  readonly lines?: number;
  readonly uniqueCatalogueRequests?: number;
  readonly maximumActive: number;
  readonly queuedStartsAfterFatal?: number;
  readonly aborted?: number;
  readonly settled: number;
  readonly responseClosed: number;
  readonly outstanding: number;
}

interface DemoSummary {
  readonly success: ScenarioSummary;
  readonly basketFailure: ScenarioSummary;
  readonly callerCancellation: ScenarioSummary;
}

type CliClient = NonNullable<NonNullable<Parameters<typeof createProgram>[0]>["client"]>;
interface PlanCommandRun {
  readonly pending: Promise<unknown>;
  readonly output: string[];
  readonly cancel: () => void;
}

const basket = (): Basket => ({
  items: [],
  productsPrice: 0,
  deliveryPrice: 0,
  numberOfProducts: 0,
  deliveryTime: undefined,
});

const product = (query: string): Product => ({
  id: Number(query.replace("item-", "")) + 1,
  name: query,
  price: 12,
  unit: "12 kr/stk",
  unitPrice: 12,
  unitSize: "1 stk",
  brand: "Loopback",
  category: "Dagligvarer",
  subcategory: "",
  imageUrl: "",
  available: true,
  labels: [],
  isOrganic: false,
  isFrozen: false,
  isRefrigerated: false,
  isDairy: false,
  isLactoseFree: false,
  isGlutenFree: false,
  isVegan: false,
  isOnDiscount: false,
});

const json = (value: unknown): string => JSON.stringify(value);

const writeJson = (response: ServerResponse, status: number, value: unknown): void => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(json(value));
};

const createHarness = async (scenario: Scenario): Promise<LoopbackHarness> => {
  const metrics: HarnessMetrics = {
    requests: [],
    catalogueStarted: 0,
    catalogueActive: 0,
    maximumCatalogueActive: 0,
    clientOutstanding: 0,
    clientSettled: 0,
  };
  const timers = new Set<Timer>();
  const sockets = new Set<Socket>();
  const startWaiters = new Set<() => void>();
  let baseUrl = "";

  const schedule = (work: () => void, delayMs: number): Timer => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      work();
    }, delayMs);
    timers.add(timer);
    return timer;
  };

  const notifyCatalogueStarts = (): void => {
    for (const waiter of startWaiters) waiter();
  };

  const waitForCatalogueStarts = (count: number): Promise<void> => {
    if (metrics.catalogueStarted >= count) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = schedule(() => {
        startWaiters.delete(check);
        reject(new Error(`Timed out waiting for ${count} catalogue requests.`));
      }, 2_000);
      const check = (): void => {
        if (metrics.catalogueStarted < count) return;
        clearTimeout(timeout);
        timers.delete(timeout);
        startWaiters.delete(check);
        resolve();
      };
      startWaiters.add(check);
    });
  };

  const requestHandler = (request: IncomingMessage, response: ServerResponse): void => {
    const requestUrl = new URL(request.url ?? "/", baseUrl || "http://127.0.0.1");
    const isBasket = requestUrl.pathname === "/basket";
    const isCatalogue = requestUrl.pathname === "/catalogue";
    if (!isBasket && !isCatalogue) {
      writeJson(response, 404, { error: "not found" });
      return;
    }

    const record: RequestRecord = {
      kind: isBasket ? "basket" : "catalogue",
      startedAt: performance.now(),
      requestEnded: false,
      responseClosed: false,
      completed: false,
      aborted: false,
    };
    metrics.requests.push(record);
    request.on("end", () => { record.requestEnded = true; });
    response.on("close", () => {
      record.responseClosed = true;
      if (!record.completed) record.aborted = true;
      if (record.kind === "catalogue") metrics.catalogueActive -= 1;
    });
    request.resume();

    if (isBasket) {
      const fail = (): void => {
        if (response.destroyed) return;
        if (scenario === "basket-failure") {
          metrics.fatalAt = performance.now();
          record.completed = true;
          writeJson(response, 503, { error: "local basket failure" });
        } else {
          record.completed = true;
          writeJson(response, 200, basket());
        }
      };
      if (scenario === "basket-failure") {
        // Make the fatal response wait until the coordinator's initial batch is
        // visible, proving that queued work is not started after the failure.
        let sent = false;
        const send = (): void => {
          if (sent) return;
          sent = true;
          fail();
        };
        const initialBatch = (): void => {
          if (metrics.catalogueStarted >= 3) send();
        };
        startWaiters.add(initialBatch);
        schedule(() => {
          startWaiters.delete(initialBatch);
          send();
        }, 500);
      } else schedule(fail, 2);
      return;
    }

    metrics.catalogueStarted += 1;
    metrics.catalogueActive += 1;
    metrics.maximumCatalogueActive = Math.max(metrics.maximumCatalogueActive, metrics.catalogueActive);
    notifyCatalogueStarts();
    const query = requestUrl.searchParams.get("query") ?? "unknown";
    const delayMs = scenario === "success" ? 8 : 250;
    schedule(() => {
      if (response.destroyed) return;
      record.completed = true;
      writeJson(response, 200, [product(query)]);
    }, delayMs);
  };

  const server: Server = createServer(requestHandler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server!.once("error", onError);
    server!.listen(0, "127.0.0.1", () => {
      server!.off("error", onError);
      const address = server!.address();
      if (!address || typeof address === "string") {
        reject(new Error("Loopback server did not expose a TCP address."));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  const read = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    metrics.clientOutstanding += 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal });
      if (!response.ok) throw new Error(`Loopback HTTP ${response.status}`);
      return await response.json() as T;
    } finally {
      metrics.clientOutstanding -= 1;
      metrics.clientSettled += 1;
    }
  };

  const client: ProductDiscoveryClient = {
    searchProducts: (query, _limit, signal) => read<Product[]>(`/catalogue?query=${encodeURIComponent(query)}`, signal),
    getProduct: (id, signal) => read<Product>(`/catalogue?query=${encodeURIComponent(`item-${id - 1}`)}`, signal),
    getCart: (signal) => read<Basket>("/basket", signal),
  };

  const waitForQuiescence = async (): Promise<void> => {
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const responsesClosed = metrics.requests.every((request) => request.responseClosed);
      if (responsesClosed && metrics.catalogueActive === 0 && metrics.clientOutstanding === 0) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error("Loopback requests did not become quiescent.");
  };

  const close = async (): Promise<void> => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    startWaiters.clear();
    for (const socket of sockets) socket.destroy();
    if (server?.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    server?.closeAllConnections?.();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
  };

  return { metrics, client, waitForCatalogueStarts, waitForQuiescence, close };
};

const input = (lines = 24, keys = 12) => ({
  lines: Array.from({ length: lines }, (_, index) => ({
    id: `line-${index}`,
    name: `item-${index % keys}`,
    quantity: 1,
    constraints: {},
    preferences: [],
  })),
});

const withPlanCommand = async <T>(
  harness: LoopbackHarness,
  planInput: ReturnType<typeof input>,
  work: (command: PlanCommandRun) => Promise<T>,
): Promise<T> => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nemlig-product-discovery-"));
  const inputFile = join(temporaryDirectory, "plan.json");
  await writeFile(inputFile, `${JSON.stringify(planInput)}\n`, { encoding: "utf8", mode: 0o600 });
  const output: string[] = [];
  let interrupt: (() => void) | undefined;
  const signals = {
    once: (_event: "SIGINT", listener: () => void): unknown => {
      interrupt = listener;
      return signals;
    },
    removeListener: (_event: "SIGINT", listener: () => void): unknown => {
      if (interrupt === listener) interrupt = undefined;
      return signals;
    },
  };
  const cliClient = {
    ...harness.client,
    isLoggedIn: (): boolean => true,
  } as unknown as CliClient;
  const pending = createProgram({
    client: cliClient,
    credentials: async () => undefined,
    signals,
    out: (message: string) => output.push(message),
  }).parseAsync(["node", "nemlig", "plan", inputFile, "--json"]);
  try {
    return await work({
      pending,
      output,
      cancel: () => {
        assert.ok(interrupt, "the plan command registered its SIGINT handler");
        interrupt();
      },
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

const commandPlan = (output: readonly string[]): ShoppingPlan => {
  assert.equal(output.length, 1, "the JSON plan command emits one result");
  return JSON.parse(output[0]!) as ShoppingPlan;
};

const evidence = (harness: LoopbackHarness): void => {
  assert.equal(harness.metrics.clientOutstanding, 0, "all fetch promises settled");
  assert.equal(harness.metrics.catalogueActive, 0, "all catalogue requests settled");
  assert.ok(harness.metrics.requests.length > 0, "the local server saw requests");
  assert.ok(harness.metrics.requests.every((request) => request.requestEnded), "every request reached the server end event");
  assert.ok(harness.metrics.requests.every((request) => request.responseClosed), "every response emitted close");
};

const runSuccess = async () => {
  const harness = await createHarness("success");
  try {
    const plan = await withPlanCommand(harness, input(), async (command) => {
      await command.pending;
      await harness.waitForQuiescence();
      return commandPlan(command.output);
    });
    assert.equal(plan.lines.length, 24);
    assert.equal(harness.metrics.catalogueStarted, 12);
    assert.ok(harness.metrics.maximumCatalogueActive <= 3);
    evidence(harness);
    return {
      lines: plan.lines.length,
      uniqueCatalogueRequests: harness.metrics.catalogueStarted,
      maximumActive: harness.metrics.maximumCatalogueActive,
      settled: harness.metrics.clientSettled,
      responseClosed: harness.metrics.requests.filter((request) => request.responseClosed).length,
      outstanding: harness.metrics.clientOutstanding,
    };
  } finally {
    await harness.close();
  }
};

const runFatal = async (scenario: "basket-failure" | "caller-cancellation") => {
  const harness = await createHarness(scenario);
  try {
    await withPlanCommand(harness, input(), async (command) => {
      await harness.waitForCatalogueStarts(3);
      if (scenario === "caller-cancellation") {
        harness.metrics.cancellationAt = performance.now();
        command.cancel();
      }
      await assert.rejects(command.pending);
      await harness.waitForQuiescence();
    });
    assert.equal(harness.metrics.catalogueStarted, 3, "fatal completion leaves queued reads unstarted");
    assert.ok(harness.metrics.maximumCatalogueActive <= 3);
    const cutoff = scenario === "basket-failure" ? harness.metrics.fatalAt : harness.metrics.cancellationAt;
    assert.ok(cutoff !== undefined);
    assert.equal(harness.metrics.requests.filter((request) => request.kind === "catalogue" && request.startedAt > cutoff).length, 0);
    assert.ok(harness.metrics.requests.some((request) => request.kind === "catalogue" && request.aborted), "fatal path aborts active HTTP reads");
    evidence(harness);
    return {
      initialCatalogueRequests: 3,
      maximumActive: harness.metrics.maximumCatalogueActive,
      queuedStartsAfterFatal: 0,
      aborted: harness.metrics.requests.filter((request) => request.aborted).length,
      settled: harness.metrics.clientSettled,
      responseClosed: harness.metrics.requests.filter((request) => request.responseClosed).length,
      outstanding: harness.metrics.clientOutstanding,
    };
  } finally {
    await harness.close();
  }
};

export const runDemoProductDiscovery = async (): Promise<DemoSummary> => ({
  success: await runSuccess(),
  basketFailure: await runFatal("basket-failure"),
  callerCancellation: await runFatal("caller-cancellation"),
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = await runDemoProductDiscovery();
  process.stdout.write(`${JSON.stringify({ ok: true, ...summary })}\n`);
}
