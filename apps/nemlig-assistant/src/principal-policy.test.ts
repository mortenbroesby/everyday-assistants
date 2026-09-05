import assert from "node:assert/strict";
import test from "node:test";
import {
  findEnabledPrincipal,
  MAX_PRINCIPAL_POLICY_BYTES,
  parsePrincipalPolicy,
} from "./principal-policy.js";

const key = (character: string) => character.repeat(32);
const validPolicy = () => ({
  schema_version: 1,
  revision: "family-v1",
  budgets: {
    principal_minute_limits: { "0": 60, "1": 20, "2": 5 },
    tier0_reserve: { minute: 20, month: 30_000 },
    guest_limit: { minute: 40, month: 125_000 },
    tier1_shed_at: { minute: 40, month: 125_000 },
    tier2_shed_at: { minute: 20, month: 60_000 },
  },
  principals: [{
    subject: "auth0|owner",
    principal_key: key("a"),
    tier: 0,
    enabled: true,
    nemlig: { username: "owner@example.test", password: "owner-secret" },
  }],
});

test("parses a bounded owner-only policy and resolves only enabled exact subjects", () => {
  const raw = JSON.stringify(validPolicy());
  const policy = parsePrincipalPolicy(raw);
  assert.equal(policy.revision, "family-v1");
  assert.equal(findEnabledPrincipal(policy, "auth0|owner")?.principal_key, key("a"));
  assert.equal(findEnabledPrincipal(policy, "auth0|other"), undefined);
  assert.equal(findEnabledPrincipal({ ...policy, principals: [{ ...policy.principals[0]!, enabled: false }] }, "auth0|owner"), undefined);
});

test("fails closed for missing, malformed, duplicate, oversized, incomplete, and invalid tier policies", () => {
  const invalidPolicies: unknown[] = [
    undefined,
    "not-json",
    { ...validPolicy(), schema_version: 2 },
    { ...validPolicy(), principals: [] },
    { ...validPolicy(), principals: [...validPolicy().principals, { ...validPolicy().principals[0], tier: 1 }] },
    { ...validPolicy(), principals: [...validPolicy().principals, { ...validPolicy().principals[0], subject: "auth0|guest" }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], enabled: false }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], principal_key: "guessable" }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], nemlig: { username: "", password: "" } }] },
    { ...validPolicy(), budgets: { ...validPolicy().budgets, tier2_shed_at: { minute: 40, month: 125_000 } } },
  ];
  for (const value of invalidPolicies) {
    const raw = typeof value === "string" || value === undefined ? value : JSON.stringify(value);
    assert.throws(() => parsePrincipalPolicy(raw), /^Error: NEMLIG_MCP_PRINCIPALS is invalid\.$/u);
  }
  assert.throws(
    () => parsePrincipalPolicy("x".repeat(MAX_PRINCIPAL_POLICY_BYTES + 1)),
    /^Error: NEMLIG_MCP_PRINCIPALS is invalid\.$/u,
  );
});

test("validation errors never disclose identity or credential values", () => {
  const secret = "never-log-this-secret";
  const fixture = validPolicy();
  fixture.principals[0]!.subject = "auth0|private-identity";
  fixture.principals[0]!.nemlig.password = secret;
  fixture.principals[0]!.principal_key = "short";
  assert.throws(() => parsePrincipalPolicy(JSON.stringify(fixture)), (error: unknown) => {
    const message = String(error);
    assert.doesNotMatch(message, /private-identity|never-log-this-secret/u);
    return true;
  });
});
