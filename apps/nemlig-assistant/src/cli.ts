#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";
import { realpathSync } from "node:fs";
import { basename } from "node:path";
import type { Basket, Product } from "./client.js";
import { NemligClient, NemligError } from "./client.js";
import {
  clearCredentials,
  getCredentials,
  promptCredentials,
  saveCredentials,
  type Credentials,
} from "./config.js";

export type ShoppingClient = Pick<
  NemligClient,
  | "isLoggedIn"
  | "login"
  | "searchProducts"
  | "getProduct"
  | "listFavorites"
  | "getCart"
  | "addToCart"
  | "removeFromCart"
  | "clearCart"
>;

interface CliDependencies {
  client: ShoppingClient;
  credentials: () => Promise<Credentials | undefined>;
  prompt: (username?: string) => Promise<Credentials>;
  save: (credentials: Credentials) => Promise<void>;
  clear: () => Promise<void>;
  out: (message: string) => void;
}

let sharedClient: NemligClient | undefined;
export const NEMLIG_VERSION = "0.2.0-alpha.1";

export const getClient = (): NemligClient => (sharedClient ??= new NemligClient());

const positiveInteger = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError("must be a positive integer");
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

export async function ensureLoggedIn(
  client: ShoppingClient,
  loadCredentials: () => Promise<Credentials | undefined> = getCredentials,
): Promise<void> {
  if (client.isLoggedIn()) return;
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new NemligError("No Nemlig credentials configured. Run `pnpm nemlig login --save`.");
  }
  await client.login(credentials.username, credentials.password);
}

export function createProgram(overrides: Partial<CliDependencies> = {}): Command {
  const dependencies: CliDependencies = {
    client: getClient(),
    credentials: getCredentials,
    prompt: promptCredentials,
    save: saveCredentials,
    clear: clearCredentials,
    out: console.log,
    ...overrides,
  };
  const program = new Command()
    .name("nemlig-shopper")
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
    .description("List current Nemlig favorites without changing favorites or the basket.")
    .option("-l, --limit <number>", "Maximum results", positiveInteger, 10)
    .action(async (options: { limit: number }) => {
      await ensureLoggedIn(dependencies.client, dependencies.credentials);
      const products = await dependencies.client.listFavorites(options.limit);
      dependencies.out(
        products.length
          ? ["ID       Name                          Price    Size       Status", ...products.map(formatProduct)].join("\n")
          : "No favorites found.",
      );
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
