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
    principal_minute_limits: { "0": 20, "1": 20, "2": 20 },
    tier0_reserve: { minute: 20, month: 30_000 },
    guest_limit: { minute: 20, month: 30_000 },
    tier1_shed_at: { minute: 20, month: 30_000 },
    tier2_shed_at: { minute: 20, month: 30_000 },
  },
  principals: [{
    subject: "auth0|owner",
    principal_key: key("a"),
    tier: 0,
    enabled: true,
    nemlig: { username: "owner@example.test", password: "owner-secret" },
  }],
});

const validV2Policy = () => ({
  schema_version: 2,
  revision: "family-v2",
  budgets: validPolicy().budgets,
  organization: { id: "org_abcdefgh" },
  invitation: { default_tier: 1 },
  owner: {
    subject: "auth0|owner",
    principal_key: key("a"),
    tier: 0,
    enabled: true,
  },
});

test("parses a bounded owner-only policy and resolves only enabled exact subjects", () => {
  const raw = JSON.stringify(validPolicy());
  const policy = parsePrincipalPolicy(raw);
  assert.equal(policy.revision, "family-v1");
  assert.equal(findEnabledPrincipal(policy, "auth0|owner")?.principal_key, key("a"));
  assert.equal(findEnabledPrincipal(policy, "auth0|other"), undefined);
  assert.equal(findEnabledPrincipal({ ...policy, principals: [{ ...policy.principals[0]!, enabled: false }] }, "auth0|owner"), undefined);
});

test("parses credential-free schema v2 and rejects dynamic identities or credentials in static policy", () => {
  const policy = parsePrincipalPolicy(JSON.stringify(validV2Policy()));
  assert.equal(policy.schema_version, 2);
  assert.equal(policy.organization?.id, "org_abcdefgh");
  assert.equal(policy.invitation?.default_tier, 1);
  assert.deepEqual(policy.principals, [validV2Policy().owner]);
  assert.equal(findEnabledPrincipal(policy, "auth0|owner")?.principal_key, key("a"));

  for (const invalid of [
    { ...validV2Policy(), principals: [{ ...validV2Policy().owner, subject: "auth0|guest", tier: 1 }] },
    { ...validV2Policy(), owner: { ...validV2Policy().owner, nemlig: { username: "owner@example.test", password: "secret" } } },
    { ...validV2Policy(), owner: { ...validV2Policy().owner, principal_key: "guessable" } },
    { ...validV2Policy(), budgets: { ...validV2Policy().budgets, tier2_shed_at: { minute: 19, month: 30_000 } } },
  ]) assert.throws(() => parsePrincipalPolicy(JSON.stringify(invalid)), /NEMLIG_MCP_PRINCIPALS is invalid/u);
});

test("fails closed for missing, malformed, duplicate, oversized, incomplete, and invalid tier policies", () => {
  const invalidPolicies: unknown[] = [
    undefined,
    "not-json",
    { ...validPolicy(), schema_version: 3 },
    { ...validPolicy(), principals: [] },
    { ...validPolicy(), principals: [...validPolicy().principals, { ...validPolicy().principals[0], tier: 1 }] },
    { ...validPolicy(), principals: [...validPolicy().principals, { ...validPolicy().principals[0], subject: "auth0|guest" }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], enabled: false }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], principal_key: "guessable" }] },
    { ...validPolicy(), principals: [{ ...validPolicy().principals[0], nemlig: { username: "", password: "" } }] },
    { ...validPolicy(), budgets: { ...validPolicy().budgets, tier2_shed_at: { minute: 19, month: 30_000 } } },
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
