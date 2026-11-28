import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import { stagingSettings } from "./staging-journey.ts";

test("staging requires isolated identity, an enabled machine shopper and an independent human owner", () => {
  const member = (subject, letter) => ({
    subject,
    principal_key: letter.repeat(32),
    enabled: true,
  });
  const policy = {
    schema_version: 3,
    revision: "staging",
    owner_subject: "synthetic-owner",
    principals: [
      member("synthetic-owner", "a"),
      member("fixture@clients", "b"),
    ],
  };
  const env = {
    STAGING_AUTH0_ISSUER: "https://staging.example.auth0.com/",
    STAGING_AUTH0_CLIENT_ID: "fixture",
    STAGING_AUTH0_CLIENT_SECRET: "fixture",
    STAGING_PRINCIPALS: JSON.stringify(policy),
    STAGING_CREDENTIAL_KEY: "c".repeat(43),
  };
  assert.equal(
    stagingSettings(env).issuer.hostname,
    "staging.example.auth0.com",
  );
  for (const issuer of [
    "http://staging.example.auth0.com/",
    "https://everyday-assistants.eu.auth0.com/",
    "https://staging.example.auth0.com/?q=test",
    "https://example.org/",
  ]) {
    assert.throws(
      () => stagingSettings({ ...env, STAGING_AUTH0_ISSUER: issuer }),
      /development Auth0/,
    );
  }
  assert.throws(
    () => stagingSettings({ ...env, STAGING_AUTH0_CLIENT_ID: "unknown" }),
    /machine shopper/,
  );
  assert.throws(
    () => stagingSettings({ ...env, STAGING_CREDENTIAL_KEY: "short" }),
    /Invalid staging key/,
  );
  assert.throws(
    () =>
      stagingSettings({
        ...env,
        STAGING_PRINCIPALS: JSON.stringify({
          ...policy,
          owner_subject: "fixture@clients",
        }),
      }),
    /human owner/,
  );
});

test("staging has distinct bindings, container entrypoint and a single hosted route", () => {
  const config = JSON.parse(
    readFileSync(new URL("../wrangler.staging.json", import.meta.url), "utf8"),
  );
  assert.equal(config.main, "src/journey-worker.ts");
  assert.deepEqual(config.routes, [
    { pattern: "nemlig-staging.broesby.dk", custom_domain: true },
  ]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.containers[0].max_instances, 1);
  assert.equal(config.containers[0].image_vars.JOURNEY_BUILD, "1");
  assert.equal(config.vars.MCP_CREDENTIAL_ONBOARDING_ENABLED, "false");
  assert.ok(
    config.durable_objects.bindings.every((binding) => !binding.script_name),
  );
});
