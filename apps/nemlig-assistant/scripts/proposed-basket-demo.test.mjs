import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const html = await readFile(new URL("../proposed-basket-demo.html", import.meta.url), "utf8");

test("proposed basket demo exposes the intended safe review states", () => {
  assert.equal((html.match(/class="review-toggle"/g) ?? []).length, 3);
  assert.equal((html.match(/class="review-toggle"[^>]*checked/g) ?? []).length, 0);
  assert.match(html, /From favorites/);
  assert.match(html, /61% confidence/);
  assert.match(html, /Search the catalogue instead/);
  assert.match(html, /Review selected basket/);
  assert.match(html, /buttons do not contact Nemlig or change a basket/);
});
