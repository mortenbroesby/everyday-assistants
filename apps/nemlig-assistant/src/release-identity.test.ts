import assert from "node:assert/strict";
import test from "node:test";
import { parseCodename, readPackageIdentity } from "./release-identity.js";

test("runtime identity accepts a reviewed word and rejects suffixes and whitespace", () => {
  assert.deepEqual(readPackageIdentity('{"version":"4.8.0","nemligRelease":{"codename":"Callsign"}}', "fixture"), { version: "4.8.0", codename: "Callsign" });
  for (const word of ["Callsign-2", "Callsign\n", " Callsign", "CallSign", "Callsign1", "A" + "a".repeat(24)]) {
    assert.throws(() => parseCodename(word), /codename/i);
  }
});

test("runtime identity accepts a historical manifest without release metadata", () => {
  assert.deepEqual(readPackageIdentity('{"version":"4.8.0"}', "fixture"), { version: "4.8.0", codename: null });
});

test("runtime identity rejects missing versions and incomplete or invalid release metadata", () => {
  for (const contents of ['null', '{}', '{"version":7}', '{"version":""}']) {
    assert.throws(() => readPackageIdentity(contents, "fixture"), /fixture is missing a version string/u);
  }
  for (const contents of [
    '{"version":"4.8.0","nemligRelease":null}',
    '{"version":"4.8.0","nemligRelease":{}}',
    '{"version":"4.8.0","nemligRelease":{"codename":7}}',
  ]) {
    assert.throws(() => readPackageIdentity(contents, "fixture"), /fixture is missing a release codename string/u);
  }
  assert.throws(
    () => readPackageIdentity('{"version":"4.8.0","nemligRelease":{"codename":"CallSign"}}', "fixture"),
    /Invalid Nemlig release codename/u,
  );
});
