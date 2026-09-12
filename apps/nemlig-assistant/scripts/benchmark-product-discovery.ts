import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { type Basket, NemligError, type Product } from "../src/client.js";
import { type CatalogueRetrieval, type ProductDiscoveryClient, resolveProductDiscovery, type ProductDiscoveryOptions } from "../src/product-discovery.js";
import { resolveNativeProductDiscovery } from "./native-product-discovery.js";

const repetitions = 7;
const delayMs = 3;
const product = (id: number, name: string): Product => ({ id, name, price: 10, unit: "10 kr/kg", unitPrice: 10, unitSize: "1 kg", brand: "Benchmark", category: "", subcategory: "", imageUrl: "", available: true, labels: [], isOrganic: false, isFrozen: false, isRefrigerated: false, isDairy: false, isLactoseFree: false, isGlutenFree: false, isVegan: false, isOnDiscount: false });
const basket = (): Basket => ({ items: [], productsPrice: 0, deliveryPrice: 0, numberOfProducts: 0, deliveryTime: undefined });
const search = (query: string): CatalogueRetrieval => ({ kind: "search", query, limit: 20 });
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const p95 = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;

type Scenario = "ordinary-failure" | "401" | "basket-failure" | "caller-cancellation";
type Coordinator = "native" | "effect";
interface Metrics { reads: number; catalogueReads: number; maximumCatalogueReads: number; startsAfterFatal: number; completionsAfterFatal: number; cancellationToSettlementMs?: number; error?: string; }

const fake = (scenario?: Scenario): { client: ProductDiscoveryClient; metrics: Metrics; signal?: AbortSignal; waitForQuiescence(): Promise<void> } => {
  const metrics: Metrics = { reads: 0, catalogueReads: 0, maximumCatalogueReads: 0, startsAfterFatal: 0, completionsAfterFatal: 0 };
  let active = 0; let fatalAt: number | undefined; let lastSettlement: number | undefined; let lastActivity = performance.now();
  const controller = scenario === "caller-cancellation" ? new AbortController() : undefined;
  const fail = scenario === "ordinary-failure" ? new Error("ordinary catalogue failure") : scenario === "401" ? new NemligError("expired session", 401) : new Error("basket failure");
  const shouldFailCatalogue = (query: string) => (scenario === "ordinary-failure" || scenario === "401") && query === "item-0";
  const read = <T>(value: T, signal: AbortSignal | undefined, catalogue: boolean, shouldFail = false): Promise<T> => {
    const promise = new Promise<T>((resolve, reject) => {
    metrics.reads += 1; lastActivity = performance.now(); if (catalogue) { metrics.catalogueReads += 1; active += 1; metrics.maximumCatalogueReads = Math.max(metrics.maximumCatalogueReads, active); }
    if (fatalAt !== undefined) metrics.startsAfterFatal += 1;
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      if (catalogue) active -= 1;
      lastSettlement = performance.now();
      lastActivity = lastSettlement;
      if (fatalAt !== undefined) metrics.completionsAfterFatal += 1;
      if (error === undefined) resolve(value); else reject(error);
    };
    const timer = setTimeout(() => { if (shouldFail) { fatalAt = performance.now(); finish(fail); } else finish(); }, delayMs);
    const abort = () => { clearTimeout(timer); if (fatalAt === undefined) fatalAt = performance.now(); setTimeout(() => finish(signal?.reason ?? new DOMException("cancelled", "AbortError")), 1); };
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    });
    // Native sibling work intentionally outlives the first rejection; suppress
    // process-level unhandled-rejection noise while callers still observe it.
    void promise.catch(() => undefined);
    return promise;
  };
  const client: ProductDiscoveryClient = {
    searchProducts: (query, _limit, signal) => read([product(query.length, query)], signal, true, shouldFailCatalogue(query)),
    getProduct: (id, signal) => read(product(id, String(id)), signal, true, shouldFailCatalogue(String(id))),
    getCart: (signal) => read(basket(), signal, false, scenario === "basket-failure"),
  };
  if (controller) setTimeout(() => controller.abort(new DOMException("caller cancelled", "AbortError")), delayMs);
  Object.defineProperty(metrics, "cancellationToSettlementMs", { get: () => fatalAt && lastSettlement ? lastSettlement - fatalAt : undefined, enumerable: true });
  const waitForQuiescence = async (): Promise<void> => {
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      if (active === 0 && performance.now() - lastActivity >= delayMs * 2) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("Benchmark reads did not become quiescent.");
  };
  return { client, metrics, signal: controller?.signal, waitForQuiescence };
};

const retrievals = (count: number, keys = count): CatalogueRetrieval[] => Array.from({ length: count }, (_, index) => search(`item-${index % keys}`));
const resolve = (coordinator: Coordinator, client: ProductDiscoveryClient, reads: readonly CatalogueRetrieval[], options: ProductDiscoveryOptions) => coordinator === "native" ? resolveNativeProductDiscovery(client, reads, options.signal) : resolveProductDiscovery(client, reads, options);
const successCases = [1, 5, 24, 50].map((count) => ({ name: `${count}-unique`, reads: retrievals(count) })).concat([{ name: "24-lines-12-keys", reads: retrievals(24, 12) }]);
const results: unknown[] = [];
for (const benchmarkCase of successCases) for (const coordinator of ["native", "effect"] as const) {
  const elapsed: number[] = []; let sample: Metrics | undefined;
  for (let run = 0; run < repetitions; run += 1) { const fixture = fake(); const started = performance.now(); await resolve(coordinator, fixture.client, benchmarkCase.reads, {}); elapsed.push(performance.now() - started); sample = fixture.metrics; }
  results.push({ type: "success", coordinator, case: benchmarkCase.name, repetitions, logicalReads: sample!.catalogueReads, maximumCatalogueReads: sample!.maximumCatalogueReads, medianMs: Number(median(elapsed).toFixed(3)), p95Ms: Number(p95(elapsed).toFixed(3)), rawElapsedMs: elapsed.map((x) => Number(x.toFixed(3))) });
}
for (const scenario of ["ordinary-failure", "401", "basket-failure", "caller-cancellation"] as const) for (const coordinator of ["native", "effect"] as const) {
  const fixture = fake(scenario); const started = performance.now();
  try { await resolve(coordinator, fixture.client, retrievals(24), { signal: fixture.signal }); } catch (error) { fixture.metrics.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error); }
  const returnElapsedMs = performance.now() - started;
  await fixture.waitForQuiescence();
  results.push({ type: "lifecycle", coordinator, scenario, returnElapsedMs: Number(returnElapsedMs.toFixed(3)), quiescenceElapsedMs: Number((performance.now() - started).toFixed(3)), ...fixture.metrics });
}
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(appRoot, ".product-discovery", "benchmark.json");
await mkdir(path.dirname(output), { recursive: true });
const report = { environment: { node: process.version, platform: process.platform, architecture: process.arch }, repetitions, delayMs, successCases: "native and Effect both coalesce request-local keys; lifecycle cases use unique keys", results };
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, ...report }, null, 2)}\n`);
