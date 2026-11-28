import test from "node:test";
import assert from "node:assert/strict";
import { createJourneyShopper } from "./journey-shopper.js";

test("the journey shopper serves the synthetic catalogue and rejects provider actions", async () => {
  const { client } = createJourneyShopper();
  const [milk] = await client.searchProducts("laktosefri mælk");
  assert.ok(milk?.isLactoseFree && milk.id);
  assert.deepEqual(await client.getFreshProduct(milk.id), milk);
  assert.deepEqual(await client.searchProducts("bananer"), []);
  await assert.rejects(client.getProduct(1), /Unknown synthetic product/);
  await assert.rejects(
    client.login("fixture", "fixture"),
    /no provider account/,
  );
  await assert.rejects(client.addToCart(milk.id, 1), /does not submit/);
  assert.equal(client.addManyToCart, undefined);
});
