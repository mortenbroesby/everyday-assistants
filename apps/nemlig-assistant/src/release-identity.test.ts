import assert from "node:assert/strict";
import test from "node:test";
import { parseCodename, readPackageIdentity } from "./release-identity.js";

test("runtime identity accepts a reviewed word and rejects suffixes and whitespace", () => {
  assert.deepEqual(readPackageIdentity('{"version":"4.8.0","nemligRelease":{"codename":"Callsign"}}', "fixture"), { version: "4.8.0", codename: "Callsign" });
  for (const word of ["Callsign-2", "Callsign\n", " Callsign", "CallSign", "Callsign1", "A" + "a".repeat(24)]) {
    assert.throws(() => parseCodename(word), /codename/i);
  }
});
