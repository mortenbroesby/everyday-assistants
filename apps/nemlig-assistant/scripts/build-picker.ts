import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const script = await readFile(path.join(dist, "picker", "picker.iife.js"), "utf8");
const css = `${await readFile(path.join(dist, "picker.css"), "utf8")}${await readFile(path.join(dist, "picker", "style.css"), "utf8")}`.replace(/@font-face\{[^}]*\}/g, "");
const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
assert.ok(Buffer.byteLength(html) <= 1_500_000, "picker exceeds 1.5 MiB raw budget");
assert.ok(gzipSync(html).byteLength <= 350_000, "picker exceeds 350 KiB gzip budget");
assert.doesNotMatch(html, /(?:url\(|(?:src|href)=['"])(?:https?:)?\/\//iu, "picker contains a remote executable, style, or font reference");
await writeFile(path.join(dist, "picker.html"), html);
await rm(path.join(dist, "picker"), { recursive: true, force: true });
await rm(path.join(dist, "picker.css"), { force: true });
