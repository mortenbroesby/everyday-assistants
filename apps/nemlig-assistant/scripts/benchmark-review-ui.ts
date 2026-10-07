import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, type Browser } from "playwright";
import type { ProductView } from "../src/product-presentation.js";
import { renderProductViewerHtml } from "../src/product-viewer.js";

const DEFAULT_RUNS = 10;
const VIEWPORT = { width: 375, height: 812 };
const PRODUCT_NAME = "Benchmark product 1";

const benchmarkViews: ProductView[] = [1, 2, 3].map((id) => ({
  context: "search",
  status: "complete",
  product: {
    id,
    name: `Benchmark product ${id}`,
    price: 19.95,
    unit_price: 39.9,
    unit: "kr/kg",
    unit_size: "500 g",
    category: "Grocery",
    subcategory: "Synthetic",
    currency: "DKK",
    description: "Synthetic benchmark details.",
    declaration: "Synthetic ingredient declaration.",
    details: [{ key: "Origin", value: "Fixture" }],
    brand: "Fixture",
    available: true,
    is_organic: false,
    is_frozen: false,
    is_on_discount: false,
    image_url: undefined,
    labels: ["Available"],
    tags: [],
  },
}));

type Renderer = { name: "current" | "candidate"; html: string; rawBytes: number; gzipBytes: number };
type Sample = {
  fcpMs: number | null;
  domContentLoadedMs: number;
  loadMs: number;
  firstProductMs: number;
  disclosureMs: number;
  encodedBytes: number;
};

function parseOptions(args: string[]): { candidatePath?: string; runs: number } {
  let candidatePath: string | undefined;
  let runs = DEFAULT_RUNS;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      console.log("Usage: pnpm --filter nemlig-assistant bench:review-ui [--runs 10] [--candidate <self-contained-html>]");
      process.exit(0);
    }
    if (argument === "--candidate") {
      candidatePath = args[index + 1];
      if (!candidatePath) throw new Error("--candidate requires a path to a self-contained HTML file.");
      index += 1;
      continue;
    }
    if (argument === "--runs") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 3 || value > 50) throw new Error("--runs must be an integer from 3 to 50.");
      runs = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return { ...(candidatePath ? { candidatePath } : {}), runs };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

function timingSummary(values: number[]): { median: number; p95: number } | null {
  return values.length ? { median: median(values), p95: percentile95(values) } : null;
}

function serveHtml(renderers: Renderer[]) {
  const paths = new Map(renderers.map((renderer) => [renderer.name === "current" ? "/current" : "/candidate", renderer.html]));
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const html = paths.get(request.url ?? "");
    if (!html) {
      response.writeHead(404).end();
      return;
    }
    const acceptsGzip = request.headers["accept-encoding"]?.includes("gzip") ?? false;
    const body = acceptsGzip ? gzipSync(html, { level: 9 }) : Buffer.from(html);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.byteLength,
      "Content-Type": "text/html; charset=utf-8",
      ...(acceptsGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
    }).end(body);
  });
}

async function measureOne(browser: Browser, renderer: Renderer, url: string): Promise<Sample> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
    serviceWorkers: "block",
  });
  const externalRequests: string[] = [];
  try {
    await context.addInitScript((views) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector("main article")) {
          performance.mark("benchmark:first-product");
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
      Object.defineProperty(window, "openai", { configurable: true, value: { toolOutput: { views } } });
    }, benchmarkViews);
    await context.route("**/*", async (route) => {
      if (route.request().url().startsWith("http://127.0.0.1:")) {
        await route.continue();
      } else {
        externalRequests.push(route.request().url());
        await route.abort();
      }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction((name) => document.querySelector("main article")?.textContent?.includes(name) === true, PRODUCT_NAME);
    const summary = page.locator("main article > details > summary").first();
    await page.evaluate(() => {
      const disclosure = document.querySelector<HTMLDetailsElement>("main article > details");
      if (!disclosure) throw new Error("The first product has no details disclosure.");
      disclosure.querySelector("summary")?.addEventListener("click", () => {
        performance.mark("benchmark:disclosure-start");
        requestAnimationFrame(() => {
          if (disclosure.open) performance.measure("benchmark:disclosure-visible", "benchmark:disclosure-start");
        });
      }, { once: true });
    });
    await summary.click();
    await page.waitForFunction(() => performance.getEntriesByName("benchmark:disclosure-visible").length > 0);
    if (externalRequests.length) throw new Error(`${renderer.name} attempted external requests: ${externalRequests.join(", ")}`);
    if (pageErrors.length) throw new Error(`${renderer.name} had browser errors: ${pageErrors.join("; ")}`);

    return await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      const firstProduct = performance.getEntriesByName("benchmark:first-product")[0];
      const disclosure = performance.getEntriesByName("benchmark:disclosure-visible")[0];
      if (!firstProduct || !disclosure) throw new Error("The benchmark did not record product and disclosure timings.");
      return {
        fcpMs: fcp?.startTime ?? null,
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        firstProductMs: firstProduct.startTime,
        disclosureMs: disclosure.duration,
        encodedBytes: navigation.encodedBodySize,
      };
    });
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const { candidatePath, runs } = parseOptions(process.argv.slice(2));
  const currentHtml = renderProductViewerHtml();
  const renderers: Renderer[] = [{
    name: "current",
    html: currentHtml,
    rawBytes: Buffer.byteLength(currentHtml),
    gzipBytes: gzipSync(currentHtml, { level: 9 }).byteLength,
  }];
  if (candidatePath) {
    const html = await readFile(resolve(candidatePath), "utf8");
    renderers.push({ name: "candidate", html, rawBytes: Buffer.byteLength(html), gzipBytes: gzipSync(html, { level: 9 }).byteLength });
  }

  const server = serveHtml(renderers);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch (error) {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not launch installed Google Chrome. Install Chrome and retry. ${reason}`, { cause: error });
  }

  const address = server.address() as AddressInfo;
  const browserVersion = browser.version();
  const results = new Map<string, Sample[]>();
  for (const renderer of renderers) results.set(renderer.name, []);
  try {
    for (let run = 0; run < runs; run += 1) {
      const ordered = run % 2 === 0 ? renderers : [...renderers].reverse();
      for (const renderer of ordered) {
        const path = renderer.name === "current" ? "/current" : "/candidate";
        results.get(renderer.name)!.push(await measureOne(browser, renderer, `http://127.0.0.1:${address.port}${path}`));
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }

  const report = Object.fromEntries(renderers.map((renderer) => {
    const samples = results.get(renderer.name)!;
    const values = (key: keyof Sample) => samples.map((sample) => sample[key]).filter((value): value is number => typeof value === "number");
    return [renderer.name, {
      rawBytes: renderer.rawBytes,
      gzipBytes: renderer.gzipBytes,
      runs: samples.length,
      firstContentfulPaintMs: timingSummary(values("fcpMs")),
      firstProductMs: timingSummary(values("firstProductMs")),
      domContentLoadedMs: timingSummary(values("domContentLoadedMs")),
      loadMs: timingSummary(values("loadMs")),
      disclosureVisibleMs: timingSummary(values("disclosureMs")),
      encodedResponseBytes: median(values("encodedBytes")),
    }];
  }));

  console.log(JSON.stringify({
    mode: candidatePath ? "current-versus-candidate" : "current-baseline",
    browser: { name: "Google Chrome (headless via Playwright)", version: browserVersion },
    viewport: { ...VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" },
    fixture: { products: benchmarkViews.length, providerCalls: 0, basketWrites: 0 },
    cache: "fresh browser context per run; no-store local HTML response",
    timingsAreAdvisory: true,
    renderers: report,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
