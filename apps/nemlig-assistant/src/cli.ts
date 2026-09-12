#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  FAVORITES_SEARCH_POOL,
  matchFavorites,
  NemligError,
  type ShoppingClient,
  type Basket,
  type Product,
} from "./client.js";
import {
  clearCredentials,
  getCredentials,
  promptCredentials,
  saveCredentials,
  type Credentials,
} from "./config.js";
import { resolveShoppingPlan, shoppingPlanInputSchema, type ShoppingPlan } from "./plans.js";
import { ensureLoggedIn, getClient, NEMLIG_VERSION } from "./runtime.js";

export { ensureLoggedIn, getClient, NEMLIG_VERSION } from "./runtime.js";
export type { ShoppingClient } from "./client.js";

interface SignalSource {
  once(event: "SIGINT", listener: () => void): unknown;
  removeListener(event: "SIGINT", listener: () => void): unknown;
}

interface CliDependencies {
  client: ShoppingClient;
  credentials: () => Promise<Credentials | undefined>;
  prompt: (username?: string) => Promise<Credentials>;
  save: (credentials: Credentials) => Promise<void>;
  clear: () => Promise<void>;
  out: (message: string) => void;
  signals: SignalSource;
}

const positiveInteger = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError("must be a positive integer");
  return parsed;
};

const timeoutMilliseconds = (value: string): number => {
  const parsed = positiveInteger(value);
  if (parsed > 60_000) throw new InvalidArgumentError("must be between 1 and 60000 milliseconds");
  return parsed;
};

export const formatBasket = (basket: Basket): string => {
  if (!basket.items.length) return "Your basket is empty.\nTotal: 0.00 DKK";
  const lines = basket.items.map(
    (item) => `  ${item.quantity ?? 0}x ${item.name ?? "Unknown"} - ${(item.total ?? 0).toFixed(2)} DKK`,
  );
  const products = basket.productsPrice ?? 0;
  const delivery = basket.deliveryPrice ?? 0;
  return [
    "SHOPPING BASKET",
    ...lines,
    `Products: ${basket.numberOfProducts ?? 0}`,
    `Subtotal: ${products.toFixed(2)} DKK`,
    `Delivery: ${delivery.toFixed(2)} DKK`,
    `Total: ${(products + delivery).toFixed(2)} DKK`,
    ...(basket.deliveryTime ? [`Delivery: ${basket.deliveryTime}`] : []),
  ].join("\n");
};

export const formatShoppingPlan = (plan: ShoppingPlan): string => {
  const lines = plan.lines.map((line) => {
    const selected = line.selected_product_id === undefined ? undefined : line.candidates.find((candidate) => candidate.id === line.selected_product_id);
    const status = line.clarity_reason === "discovery_unavailable"
      ? "Discovery unavailable"
      : line.resolution === "covered" ? "Covered"
      : line.resolution === "selected" ? "Selected"
      : "Unresolved";
    return `  ${status}: ${line.name}${selected ? ` — ${selected.name}` : ""}`;
  });
  return [
    "SHOPPING PLAN",
    ...lines,
    `Summary: ${plan.summary.automatically_selected} selected, ${plan.summary.covered} covered, ${plan.summary.unresolved} unresolved.`,
    "The planner called no basket mutation.",
  ].join("\n");
};

const formatProduct = (product: Product): string => {
  const tags = [
    product.isRefrigerated && "Køl",
    product.isFrozen && "Frost",
    product.isOrganic && "Øko",
    product.isDairy && "Dairy",
    product.isLactoseFree && "Laktosefri",
    product.isGlutenFree && "Glutenfri",
    product.isVegan && "Vegan",
    product.isOnDiscount && "Tilbud",
  ].filter(Boolean);
  const details = [product.brand, product.category, ...tags.map((tag) => `[${tag}]`)]
    .filter(Boolean)
    .join(" | ");
  return [
    `${String(product.id ?? "").padEnd(8)} ${(product.name ?? "Unknown").slice(0, 28).padEnd(28)}  ${(product.price ?? 0).toFixed(2).padEnd(8)} ${product.unitSize.slice(0, 10).padEnd(10)} ${product.available ? "✓ In Stock" : "✗ Sold Out"}`,
    ...(details ? [`         ${details}`] : []),
  ].join("\n");
};

export function createProgram(overrides: Partial<CliDependencies> = {}): Command {
  const dependencies: CliDependencies = {
    client: getClient(),
    credentials: getCredentials,
    prompt: promptCredentials,
    save: saveCredentials,
    clear: clearCredentials,
    out: console.log,
    signals: process,
    ...overrides,
  };
  const program = new Command()
    .name("nemlig-assistant")
    .description("Search Nemlig products and manage an explicitly approved basket.")
    .version(NEMLIG_VERSION);

  program
    .command("login")
    .description("Log in interactively without exposing the password in process arguments.")
    .option("-u, --username <email>", "Nemlig.com email")
    .option("--save", "Save credentials locally with owner-only permissions", false)
    .action(async (options: { username?: string; save: boolean }) => {
      const saved = await dependencies.credentials();
      const credentials =
        saved && (!options.username || options.username === saved.username)
          ? { username: options.username ?? saved.username, password: saved.password }
          : await dependencies.prompt(options.username);
      await dependencies.client.login(credentials.username, credentials.password);
      if (options.save) await dependencies.save(credentials);
      dependencies.out(`✓ Login successful${options.save ? "; credentials saved" : ""}.`);
    });

  program
    .command("logout")
    .description("Remove saved local credentials; this does not change the remote basket.")
    .action(async () => {
      await dependencies.clear();
      dependencies.out("✓ Saved credentials cleared.");
    });

  program
    .command("search")
    .description("Search Nemlig products using Danish terms.")
    .argument("<query>", "Product query")
    .option("-l, --limit <number>", "Maximum results", positiveInteger, 10)
    .action(async (query: string, options: { limit: number }) => {
      const products = await dependencies.client.searchProducts(query, options.limit);
      dependencies.out(
        products.length
          ? ["ID       Name                          Price    Size       Status", ...products.map(formatProduct)].join("\n")
          : "No products found.",
      );
    });

  program
    .command("cart")
    .description("View the current basket and totals.")
    .action(async () => {
      await ensureLoggedIn(dependencies.client, dependencies.credentials);
      dependencies.out(formatBasket(await dependencies.client.getCart()));
    });

  program
    .command("favorites")
    .description("List or search current Nemlig favorites without changing favorites or the basket.")
    .argument("[query]", "Danish product name")
    .option("-l, --limit <number>", "Maximum results", positiveInteger, 10)
    .option("-p, --page <number>", "Results page", positiveInteger, 1)
    .action(async (query: string | undefined, options: { limit: number; page: number }) => {
      if (options.limit > 50) throw new NemligError("Favorites page size cannot exceed 50.");
      await ensureLoggedIn(dependencies.client, dependencies.credentials);
      const favorites = await dependencies.client.listFavorites(
        query === undefined ? options.limit : FAVORITES_SEARCH_POOL,
        query === undefined ? options.page : 1,
      );
      const products = query === undefined ? favorites : matchFavorites(favorites, query, options.page * options.limit).slice((options.page - 1) * options.limit);
      dependencies.out(
        products.length
          ? ["ID       Name                          Price    Size       Status", ...products.map(formatProduct)].join("\n")
          : "No favorites found.",
      );
    });

  program
    .command("plan")
    .description("Resolve a local JSON shopping plan without applying basket changes.")
    .argument("<input-file>", "JSON file with 1–50 shopping-plan lines")
    .option("--json", "Print the resolved plan as JSON", false)
    .option("--timeout-ms <number>", "Stop planning after 1–60000 milliseconds", timeoutMilliseconds)
    .action(async (inputFile: string, options: { json: boolean; timeoutMs?: number }) => {
      const input = shoppingPlanInputSchema.parse(JSON.parse(await readFile(inputFile, "utf8")));
      const controller = new AbortController();
      const interrupt = () => controller.abort(new DOMException("Planning cancelled.", "AbortError"));
      dependencies.signals.once("SIGINT", interrupt);
      try {
        await ensureLoggedIn(dependencies.client, dependencies.credentials);
        const plan = await resolveShoppingPlan(dependencies.client, input, {
          signal: controller.signal,
          deadlineMs: options.timeoutMs,
        });
        dependencies.out(options.json ? JSON.stringify(plan, null, 2) : formatShoppingPlan(plan));
      } finally {
        dependencies.signals.removeListener("SIGINT", interrupt);
      }
    });

  program.command("departments").description("List current Nemlig department IDs.").action(async () => {
    const departments = await dependencies.client.listDepartments();
    dependencies.out(departments.length ? departments.map((item) => `${item.id}\t${item.name}`).join("\n") : "No departments found.");
  });

  program.command("browse").description("Browse one freshly validated Nemlig department.")
    .argument("<department-id>").option("-l, --limit <number>", "Page size (max 50)", positiveInteger, 20)
    .option("-p, --page <number>", "Results page", positiveInteger, 1)
    .action(async (departmentId: string, options: { limit: number; page: number }) => {
      const result = await dependencies.client.browseDepartment(departmentId, options.limit, options.page);
      dependencies.out(result.products.length ? ["ID Name Price Size Status", ...result.products.map(formatProduct), ...(result.hasNext ? [`Next page: ${result.page + 1}`] : [])].join("\n") : "No products found.");
    });

  program
    .command("add")
    .description("Add an already reviewed and explicitly approved product, then verify the basket.")
    .argument("<product-id>", "Numeric Nemlig product ID", positiveInteger)
    .option("-q, --quantity <number>", "Approved quantity", positiveInteger, 1)
    .action(async (productId: number, options: { quantity: number }) => {
      await ensureLoggedIn(dependencies.client, dependencies.credentials);
      const basket = await dependencies.client.addToCart(productId, options.quantity);
      dependencies.out(`✓ Added ${options.quantity}x product ${productId}.\n${formatBasket(basket)}`);
    });

  program
    .command("remove")
    .description("Remove one exact, already reviewed and explicitly approved product line, then verify the basket.")
    .argument("<product-id>", "Numeric Nemlig product ID", positiveInteger)
    .action(async (productId: number) => {
      await ensureLoggedIn(dependencies.client, dependencies.credentials);
      const basket = await dependencies.client.removeFromCart(productId);
      dependencies.out(`✓ Removed product ${productId}.\n${formatBasket(basket)}`);
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : "Nemlig command failed."}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && ["cli.js", "cli.ts"].includes(basename(realpathSync(process.argv[1])))) {
  void main();
}
