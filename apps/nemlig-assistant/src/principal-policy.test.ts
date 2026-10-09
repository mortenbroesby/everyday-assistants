import assert from "node:assert/strict";
import test from "node:test";
import {
  findEnabledPrincipal,
  MAX_PRINCIPAL_POLICY_BYTES,
  parsePrincipalPolicy,
} from "./principal-policy.js";

const validPolicy = () => ({
  schema_version: 3,
  revision: "family-v3",
  owner_subject: "auth0|owner",
  principals: [
    { subject: "auth0|member", principal_key: "b".repeat(32), enabled: true },
    { subject: "auth0|owner", principal_key: "a".repeat(32), enabled: true },
    {
      subject: "auth0|disabled",
      principal_key: "c".repeat(32),
      enabled: false,
    },
  ],
});

test("current family policy names an exact enabled owner independently of array order", () => {
  const fixture = validPolicy();
  const policy = parsePrincipalPolicy(JSON.stringify(fixture));
  assert.deepEqual(policy, fixture);
  assert.equal(
    findEnabledPrincipal(policy, policy.owner_subject)?.principal_key,
    "a".repeat(32),
  );
  assert.equal(
    findEnabledPrincipal(policy, "auth0|member")?.principal_key,
    "b".repeat(32),
  );
  assert.equal(findEnabledPrincipal(policy, "auth0|disabled"), undefined);
  assert.equal(findEnabledPrincipal(policy, "auth0|unknown"), undefined);
});

test("old policies and removed credentials, tiers, budgets and enrollment fields fail closed", () => {
  const fixture = validPolicy();
  const budgets = {
    tier0_reserve: { month: 30_000 },
    guest_limit: { month: 30_000 },
    tier1_shed_at: { month: 30_000 },
    tier2_shed_at: { month: 30_000 },
  };
  const oldOwner = { ...fixture.principals[1], tier: 0 };
  for (const invalid of [
    {
      schema_version: 1,
      revision: fixture.revision,
      budgets,
      principals: [
        {
          ...oldOwner,
          nemlig: {
            username: "private@example.test",
            password: "never-log-this-secret",
          },
        },
      ],
    },
    {
      schema_version: 2,
      revision: fixture.revision,
      budgets,
      organization: { id: "org_abcdefgh" },
      invitation: { default_tier: 1 },
      owner: oldOwner,
    },
    { ...fixture, schema_version: 1 },
    { ...fixture, schema_version: 2 },
    { ...fixture, budgets: {} },
    { ...fixture, organization: { id: "org_abcdefgh" } },
    { ...fixture, invitation: { default_tier: 1 } },
    { ...fixture, owner: fixture.principals[1] },
    { ...fixture, principals: [{ ...fixture.principals[1], tier: 0 }] },
    {
      ...fixture,
      principals: [
        {
          ...fixture.principals[1],
          nemlig: {
            username: "private@example.test",
            password: "never-log-this-secret",
          },
        },
      ],
    },
  ]) {
    assert.throws(
      () => parsePrincipalPolicy(JSON.stringify(invalid)),
      /^Error: NEMLIG_MCP_PRINCIPALS is invalid\.$/u,
    );
  }
});

test("missing, malformed, duplicate, oversized or ownerless family policy fails closed", () => {
  const fixture = validPolicy();
  for (const invalid of [
    undefined,
    "not-json",
    { ...fixture, principals: [] },
    { ...fixture, owner_subject: "auth0|unknown" },
    { ...fixture, owner_subject: "auth0|disabled" },
    { ...fixture, owner_subject: undefined },
    { ...fixture, principals: [...fixture.principals, fixture.principals[0]] },
    {
      ...fixture,
      principals: [{ ...fixture.principals[1], principal_key: "guessable" }],
    },
    {
      ...fixture,
      principals: [
        ...fixture.principals,
        {
          subject: "auth0|other",
          principal_key: "a".repeat(32),
          enabled: true,
        },
      ],
    },
    {
      ...fixture,
      principals: [{ ...fixture.principals[1], subject: " auth0|owner" }],
    },
  ]) {
    assert.throws(
      () =>
        parsePrincipalPolicy(
          typeof invalid === "string" || invalid === undefined
            ? invalid
            : JSON.stringify(invalid),
        ),
      /^Error: NEMLIG_MCP_PRINCIPALS is invalid\.$/u,
    );
  }
  assert.throws(
    () => parsePrincipalPolicy("x".repeat(MAX_PRINCIPAL_POLICY_BYTES + 1)),
    /NEMLIG_MCP_PRINCIPALS is invalid/u,
  );
});

test("validation errors never disclose private identities or credentials", () => {
  assert.throws(
    () =>
      parsePrincipalPolicy(
        JSON.stringify({
          ...validPolicy(),
          owner_subject: "auth0|private-identity",
          principals: [
            {
              subject: "auth0|private-identity",
              principal_key: "short",
              enabled: true,
              nemlig: {
                username: "private@example.test",
                password: "never-log-this-secret",
              },
            },
          ],
        }),
      ),
    (error: unknown) => {
      assert.equal(String(error), "Error: NEMLIG_MCP_PRINCIPALS is invalid.");
      return true;
    },
  );
});
