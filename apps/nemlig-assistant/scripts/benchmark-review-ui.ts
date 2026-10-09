import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium, type Browser } from "playwright";
import type { ProductView } from "../src/product-presentation.js";
import { readProductViewerArtifact } from "../src/product-viewer.js";
import { readLocalViewerGeneration } from "./viewer-generation.js";
import { installViewerAssetFixture } from "./viewer-asset-fixture.js";
import type { ViewerGeneration } from "../src/viewer-assets.js";

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

type Renderer = {
  name: "v7" | "v8";
  html: string;
  rawBytes: number;
  gzipBytes: number;
  assetGzipBytes: number;
};
type Sample = {
  fcpMs: number | null;
  domContentLoadedMs: number;
  loadMs: number;
  firstProductMs: number;
  disclosureMs: number;
  encodedBytes: number;
  estimatedGzipPayloadBytes: number;
};

type Timing = { median: number; p95: number } | null;
type RendererReport = {
  rawBytes: number;
  gzipBytes: number;
  runs: number;
  firstContentfulPaintMs: Timing;
  firstProductMs: Timing;
  domContentLoadedMs: Timing;
  loadMs: Timing;
  disclosureVisibleMs: Timing;
  encodedResponseBytes: number;
  estimatedGzipPayloadBytes: number;
};
type BenchmarkReport = {
  mode: string;
  browser: { name: string; version: string };
  viewport: typeof VIEWPORT & {
    deviceScaleFactor: number;
    colorScheme: string;
  };
  fixture: { products: number; providerCalls: number; basketWrites: number };
  cache: string;
  environment: {
    host: string;
    rendererFrame: string;
    timingFrame: string;
    firstProductDefinition: string;
  };
  timingsAreAdvisory: true;
  provenance: {
    checkedOutRef: string | null;
    checkedOutSha: string;
    v7BaselineSha: string;
    v7FixtureSha256: string;
    pullRequestHead: string | null;
    workflowRunId: string | null;
  };
  renderers: Record<string, RendererReport>;
};

function parseOptions(args: string[]): { outputPath?: string; runs: number } {
  let outputPath: string | undefined;
  let runs = DEFAULT_RUNS;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: pnpm --filter nemlig-assistant bench:review-ui [--runs 10] [--output <report.json>]",
      );
      process.exit(0);
    }
    if (argument === "--output") {
      outputPath = args[index + 1];
      if (!outputPath) {
        throw new Error("--output requires a JSON report path.");
      }
      index += 1;
      continue;
    }
    if (argument === "--runs") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 3 || value > 50) {
        throw new Error("--runs must be an integer from 3 to 50.");
      }
      runs = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return { ...(outputPath ? { outputPath } : {}), runs };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

function timingSummary(
  values: number[],
): { median: number; p95: number } | null {
  return values.length
    ? { median: median(values), p95: percentile95(values) }
    : null;
}

function serveHtml(renderers: Renderer[]) {
  const paths = new Map(
    renderers.map((renderer) => [`/resource/${renderer.name}`, renderer.html]),
  );
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = request.url ?? "";
    const rendererName =
      path === "/host/v7" ? "v7" : path === "/host/v8" ? "v8" : undefined;
    const html = rendererName
      ? syntheticHostHtml(rendererName)
      : paths.get(path);
    if (!html) {
      response.writeHead(404).end();
      return;
    }
    const acceptsGzip =
      request.headers["accept-encoding"]?.includes("gzip") ?? false;
    const body = acceptsGzip ? gzipSync(html, { level: 9 }) : Buffer.from(html);
    response
      .writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": "text/html; charset=utf-8",
        ...(acceptsGzip
          ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" }
          : {}),
      })
      .end(body);
  });
}

function syntheticHostHtml(renderer: "v7" | "v8"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI benchmark host</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="benchmark viewer" src="/resource/${renderer}"></iframe><script>
    const viewer = document.querySelector('iframe');
    const result = { structuredContent: { views: ${JSON.stringify(benchmarkViews)} }, content: [] };
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== viewer.contentWindow) return;
      const message = event.data;
      if (message?.jsonrpc !== '2.0') return;
      if (message.method === 'ui/initialize') {
        event.source.postMessage({jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params.protocolVersion,hostInfo:{name:'synthetic-benchmark-host',version:'1'},hostCapabilities:{},hostContext:{theme:'light'}}}, location.origin);
      } else if (message.method === 'ui/notifications/initialized') {
        event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result}, location.origin);
      }
    });
  </script></body></html>`;
}

async function measureOne(
  browser: Browser,
  renderer: Renderer,
  url: string,
  viewerGeneration: ViewerGeneration,
  assetGzipBytes: number,
): Promise<Sample> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
    serviceWorkers: "block",
  });
  const externalRequests = await installViewerAssetFixture(
    context,
    viewerGeneration,
  );
  try {
    await context.addInitScript((views) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector("main article")) {
          performance.mark("benchmark:first-product");
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
      Object.defineProperty(window, "openai", {
        configurable: true,
        value: { toolOutput: { views } },
      });
    }, benchmarkViews);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[title="benchmark viewer"]',
      );
      try {
        return frame?.contentDocument?.readyState === "complete";
      } catch {
        return false;
      }
    });
    const child = page.frames().find((frame) => frame !== page.mainFrame());
    if (!child) {
      throw new Error(
        `${renderer.name} synthetic host did not create its viewer frame.`,
      );
    }
    await child.waitForFunction(
      (name) =>
        document.querySelector("main article")?.textContent?.includes(name) ===
        true,
      PRODUCT_NAME,
    );
    const toggle = child
      .locator(
        "main article button[aria-expanded], main article > details > summary",
      )
      .first();
    await child.evaluate(() => {
      const toggle = document.querySelector<HTMLElement>(
        "main article button[aria-expanded], main article > details > summary",
      );
      if (!toggle) {
        throw new Error("The first product has no disclosure control.");
      }
      toggle.addEventListener(
        "click",
        () => {
          performance.mark("benchmark:disclosure-start");
          requestAnimationFrame(() => {
            const controlled = toggle.getAttribute("aria-controls");
            const content = controlled
              ? document.getElementById(controlled)
              : null;
            const expanded =
              toggle.getAttribute("aria-expanded") === "true" ||
              toggle.closest("details")?.open === true;
            if (expanded && (!content || !content.hidden)) {
              performance.measure(
                "benchmark:disclosure-visible",
                "benchmark:disclosure-start",
              );
            }
          });
        },
        { once: true },
      );
    });
    await toggle.click();
    await child.waitForFunction(
      () =>
        performance.getEntriesByName("benchmark:disclosure-visible").length > 0,
    );
    if (externalRequests.length) {
      throw new Error(
        `${renderer.name} attempted external requests: ${externalRequests.join(", ")}`,
      );
    }
    if (pageErrors.length) {
      throw new Error(
        `${renderer.name} had browser errors: ${pageErrors.join("; ")}`,
      );
    }

    return await child.evaluate(
      ({ assetGzipBytes, shellGzipBytes }) => {
        const navigation = performance.getEntriesByType(
          "navigation",
        )[0] as PerformanceNavigationTiming;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        const firstProduct = performance.getEntriesByName(
          "benchmark:first-product",
        )[0];
        const disclosure = performance.getEntriesByName(
          "benchmark:disclosure-visible",
        )[0];
        if (!firstProduct || !disclosure) {
          throw new Error(
            "The benchmark did not record product and disclosure timings.",
          );
        }
        return {
          fcpMs: fcp?.startTime ?? null,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadMs: navigation.loadEventEnd,
          firstProductMs: firstProduct.startTime,
          disclosureMs: disclosure.duration,
          encodedBytes: navigation.encodedBodySize,
          estimatedGzipPayloadBytes: shellGzipBytes + assetGzipBytes,
        };
      },
      { assetGzipBytes, shellGzipBytes: renderer.gzipBytes },
    );
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const { outputPath, runs } = parseOptions(process.argv.slice(2));
  const [v7Html, v7MetadataText, viewerGeneration] = await Promise.all([
    readFile(
      new URL("./fixtures/product-viewer-v7.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./fixtures/product-viewer-v7.json", import.meta.url),
      "utf8",
    ),
    readLocalViewerGeneration(
      fileURLToPath(new URL("../dist/ui-static/", import.meta.url)),
    ),
  ]);
  const v8Html = readProductViewerArtifact().html;
  const assetGzipBytes =
    gzipSync(`${JSON.stringify(viewerGeneration.manifest)}\n`, { level: 9 })
      .byteLength +
    [...viewerGeneration.assets.values()].reduce(
      (total, asset) => total + gzipSync(asset, { level: 9 }).byteLength,
      0,
    );
  const v7Metadata = JSON.parse(v7MetadataText) as {
    resourceUri?: string;
    sourceCommit?: string;
    sha256?: string;
  };
  const v7FixtureSha256 = createHash("sha256").update(v7Html).digest("hex");
  if (
    v7Metadata.resourceUri !== "ui://nemlig/product-viewer-v7.html" ||
    !v7Metadata.sourceCommit ||
    v7Metadata.sha256 !== v7FixtureSha256
  ) {
    throw new Error(
      "The pinned v7 benchmark fixture or its provenance checksum is invalid.",
    );
  }
  const renderers: Renderer[] = [
    {
      name: "v7",
      html: v7Html,
      rawBytes: Buffer.byteLength(v7Html),
      gzipBytes: gzipSync(v7Html, { level: 9 }).byteLength,
      assetGzipBytes: 0,
    },
    {
      name: "v8",
      html: v8Html,
      rawBytes: Buffer.byteLength(v8Html),
      gzipBytes: gzipSync(v8Html, { level: 9 }).byteLength,
      assetGzipBytes,
    },
  ];

  const server = serveHtml(renderers);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch (error) {
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not launch installed Google Chrome. Install Chrome and retry. ${reason}`,
      { cause: error },
    );
  }

  const address = server.address() as AddressInfo;
  const browserVersion = browser.version();
  const results = new Map<string, Sample[]>();
  for (const renderer of renderers) {
    results.set(renderer.name, []);
  }
  try {
    for (let run = 0; run < runs; run += 1) {
      const ordered = run % 2 === 0 ? renderers : [...renderers].reverse();
      for (const renderer of ordered) {
        const path = `/host/${renderer.name}`;
        results
          .get(renderer.name)!
          .push(
            await measureOne(
              browser,
              renderer,
              `http://127.0.0.1:${address.port}${path}`,
              viewerGeneration,
              renderer.name === "v8" ? renderer.assetGzipBytes : 0,
            ),
          );
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  }

  const report: BenchmarkReport = {
    mode: "v7-baseline-versus-react-v8",
    browser: {
      name: "Google Chrome (headless via Playwright)",
      version: browserVersion,
    },
    viewport: { ...VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" },
    fixture: {
      products: benchmarkViews.length,
      providerCalls: 0,
      basketWrites: 0,
    },
    cache: "fresh browser context per run; no-store local HTML response",
    environment: {
      host: "synthetic same-origin parent iframe with ui/initialize response and tool-result notification",
      rendererFrame:
        "same-origin iframe at the same viewport size for both renderers",
      timingFrame: "child viewer document; excludes parent host timing",
      firstProductDefinition:
        "DOM insertion of the first product article; not paint",
    },
    timingsAreAdvisory: true,
    provenance: {
      checkedOutRef:
        process.env.BENCHMARK_CHECKOUT_REF ??
        process.env.GITHUB_REF_NAME ??
        null,
      checkedOutSha: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      v7BaselineSha: v7Metadata.sourceCommit,
      v7FixtureSha256,
      pullRequestHead: process.env.BENCHMARK_PR_HEAD ?? null,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    },
    renderers: Object.fromEntries(
      renderers.map((renderer) => {
        const samples = results.get(renderer.name)!;
        const values = (key: keyof Sample) =>
          samples
            .map((sample) => sample[key])
            .filter((value): value is number => typeof value === "number");
        return [
          renderer.name,
          {
            rawBytes: renderer.rawBytes,
            gzipBytes: renderer.gzipBytes,
            runs: samples.length,
            firstContentfulPaintMs: timingSummary(values("fcpMs")),
            firstProductMs: timingSummary(values("firstProductMs")),
            domContentLoadedMs: timingSummary(values("domContentLoadedMs")),
            loadMs: timingSummary(values("loadMs")),
            disclosureVisibleMs: timingSummary(values("disclosureMs")),
            encodedResponseBytes: median(values("encodedBytes")),
            estimatedGzipPayloadBytes: median(
              values("estimatedGzipPayloadBytes"),
            ),
          },
        ];
      }),
    ) as Record<string, RendererReport>,
  };

  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const path = resolve(outputPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, reportJson, "utf8");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      formatStepSummary(report),
      "utf8",
    );
  }
  console.log(reportJson);
}

function formatTiming(value: Timing): string {
  return value
    ? `${value.median.toFixed(1)} ms / ${value.p95.toFixed(1)} ms`
    : "not recorded";
}

function formatDelta(current: Timing, candidate: Timing): string {
  if (!current || !candidate) {
    return "not available";
  }
  const difference = candidate.median - current.median;
  const percent =
    current.median === 0
      ? "n/a"
      : `${((difference / current.median) * 100).toFixed(1)}%`;
  return `${difference >= 0 ? "+" : ""}${difference.toFixed(1)} ms (${percent})`;
}

function formatStepSummary(report: BenchmarkReport): string {
  const v7 = report.renderers.v7;
  const v8 = report.renderers.v8;
  const metadata = `**${report.browser.name} ${report.browser.version}** · ${v7.runs} paired runs · ${report.viewport.width}×${report.viewport.height} CSS px @ ${report.viewport.deviceScaleFactor}× · ${report.fixture.products} synthetic products · ${report.cache}.`;
  const provenance = `Checked-out ref/SHA: \`${report.provenance.checkedOutRef ?? "detached"}\` / \`${report.provenance.checkedOutSha}\`; v7 baseline source: \`${report.provenance.v7BaselineSha}\` (fixture SHA-256 \`${report.provenance.v7FixtureSha256}\`); PR head: \`${report.provenance.pullRequestHead ?? "n/a"}\`.`;

  const rows: Array<
    [
      string,
      keyof Pick<
        RendererReport,
        | "firstContentfulPaintMs"
        | "firstProductMs"
        | "domContentLoadedMs"
        | "loadMs"
        | "disclosureVisibleMs"
      >,
    ]
  > = [
    ["First contentful paint", "firstContentfulPaintMs"],
    ["First product DOM insertion (not paint)", "firstProductMs"],
    ["DOM content loaded", "domContentLoadedMs"],
    ["Page load", "loadMs"],
    ["Disclosure response", "disclosureVisibleMs"],
  ];
  const timingRows = rows
    .map(
      ([label, key]) =>
        `| ${label} | ${formatTiming(v7[key])} | ${formatTiming(v8[key])} | ${formatDelta(v7[key], v8[key])} |`,
    )
    .join("\n");
  const byteDelta = v8.encodedResponseBytes - v7.encodedResponseBytes;
  const artifactDelta = v8.gzipBytes - v7.gzipBytes;
  const formatBytes = (bytes: number) => `${bytes.toLocaleString("en-US")} B`;
  return [
    "## UI benchmark: v7 viewer vs React v8 (advisory)",
    "",
    metadata,
    "Host: synthetic same-origin parent and iframe for both renderers; timings come from the child viewer document. First-product timing is DOM insertion, not paint.",
    "",
    "",
    "| Measure | v7 viewer | React v8 | React v8 − v7 |",
    "| --- | ---: | ---: | ---: |",
    ...timingRows.split("\n"),
    `| Encoded HTML response | ${formatBytes(v7.encodedResponseBytes)} | ${formatBytes(v8.encodedResponseBytes)} | ${byteDelta >= 0 ? "+" : ""}${formatBytes(byteDelta)} |`,
    `| Estimated gzip shell + manifest + JS/CSS payload | ${formatBytes(v7.estimatedGzipPayloadBytes)} | ${formatBytes(v8.estimatedGzipPayloadBytes)} | ${v8.estimatedGzipPayloadBytes - v7.estimatedGzipPayloadBytes >= 0 ? "+" : ""}${formatBytes(v8.estimatedGzipPayloadBytes - v7.estimatedGzipPayloadBytes)} |`,
    `| Standalone gzip artifact | ${formatBytes(v7.gzipBytes)} | ${formatBytes(v8.gzipBytes)} | ${artifactDelta >= 0 ? "+" : ""}${formatBytes(artifactDelta)} |`,
    "",
    `Timing cells show median / p95 across ${v7.runs} samples per renderer. Positive time deltas mean React v8 was slower; negative means faster. Values are advisory and runner-sensitive. No provider calls or basket writes were made.`,
    `\n${provenance}`,
    report.provenance.workflowRunId
      ? `[Workflow run](https://github.com/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${report.provenance.workflowRunId}).`
      : "",
    "",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
