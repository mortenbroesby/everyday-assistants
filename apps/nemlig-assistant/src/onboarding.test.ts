import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudflareEnv } from './cloudflare-config.js';
import {
  handleOnboardingRequest,
  loadOnboardingConfig,
  type OnboardingDependencies,
} from './onboarding.js';
import {
  consumePortalCsrf,
  type PrincipalStorage,
} from './principal-records.js';

const secret = (byte: number): string =>
  Buffer.alloc(32, byte).toString('base64url');
const env: CloudflareEnv = {
  MCP_CREDENTIAL_ONBOARDING_ENABLED: 'true',
  NEMLIG_MCP_PUBLIC_URL: 'https://mcp.example.test/mcp',
  NEMLIG_MCP_ONBOARDING_SESSION_KEY: secret(1),
  NEMLIG_MCP_CREDENTIAL_KEY: secret(2),
  NEMLIG_MCP_CREDENTIAL_KEY_VERSION: 'one',
  NEMLIG_MCP_PRINCIPALS: JSON.stringify({
    schema_version: 3,
    revision: 'family-v3',
    owner_subject: 'auth0|owner',
    principals: [
      { subject: 'auth0|owner', principal_key: 'a'.repeat(32), enabled: true },
    ],
  }),
};

let connected = false;
const dependencies: OnboardingDependencies = {
  authenticate: async (token) =>
    token === 'valid-access-token' ? 'auth0|owner' : undefined,
  principalStatus: async (subject) =>
    subject === 'auth0|owner' ? 'owner' : undefined,
  connectionStatus: async () => connected,
  replace: async (subject, credentials) => {
    assert.equal(subject, 'auth0|owner');
    assert.deepEqual(credentials, {
      username: 'owner@example.test',
      password: 'private-password',
    });
    connected = true;
    return 'connected';
  },
  revoke: async () => {
    connected = false;
  },
  listPrincipals: async () => [],
  setPrincipalStatus: async () => {},
  consumeCsrf: async () => true,
};

const cookieValue = (response: Response): string => {
  const match = response.headers
    .get('set-cookie')
    ?.match(/(__Host-nemlig-session=[^;]+)/u);
  assert.ok(match?.[1]);
  return match[1];
};

test('anonymous browser has a usable sign-in entry without provider or storage work', async () => {
  let calls = 0;
  const result = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect'),
    env,
    {
      ...dependencies,
      authenticate: async () => {
        calls += 1;
        return undefined;
      },
      principalStatus: async () => {
        calls += 1;
        return undefined;
      },
      connectionStatus: async () => {
        calls += 1;
        return false;
      },
    },
  );
  assert.equal(result.status, 200);
  const markup = await result.text();
  assert.match(markup, /<a href="\/connect\/sign-in">Sign in<\/a>/u);
  assert.doesNotMatch(markup, /<form/u);
  assert.equal(calls, 0);
});

test('credential portal configuration does not require request-rate settings', () => {
  const config = loadOnboardingConfig(env);
  assert.equal(config.publicUrl.href, 'https://mcp.example.test/mcp');
  assert.equal('perPrincipalRate' in config, false);
  assert.equal('globalRate' in config, false);
});

test('authenticated credential bursts keep rotating single-use CSRF without a rate gate', async (context) => {
  context.mock.method(Date, 'now', () => Date.parse('2026-09-28T12:00:00Z'));
  const values = new Map<string, unknown>();
  const storage: PrincipalStorage = {
    transaction: async (callback) => callback(),
    get: async <T>(key: string) => values.get(key) as T | undefined,
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => values.delete(key),
  };
  let validations = 0;
  const burstDependencies: OnboardingDependencies = {
    ...dependencies,
    connectionStatus: async () => validations > 0,
    replace: async (subject, credentials) => {
      assert.equal(subject, 'auth0|owner');
      assert.deepEqual(credentials, {
        username: 'owner@example.test',
        password: 'private-password',
      });
      validations += 1;
      return 'connected';
    },
    consumeCsrf: (subject, csrf, expiresAt) =>
      consumePortalCsrf(storage, subject, csrf, expiresAt),
  };
  const login = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      headers: { authorization: 'Bearer valid-access-token' },
    }),
    env,
    burstDependencies,
  );
  assert.equal(login.status, 303);
  let sessionCookie = cookieValue(login);
  const portal = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      headers: { cookie: sessionCookie },
    }),
    env,
    burstDependencies,
  );
  let html = await portal.text();
  const firstCookie = sessionCookie;
  const firstCsrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(firstCsrf);
  for (let attempt = 0; attempt < 65; attempt += 1) {
    const csrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
    assert.ok(csrf);
    const submit = (origin = 'https://mcp.example.test') =>
      handleOnboardingRequest(
        new Request('https://mcp.example.test/connect', {
          method: 'POST',
          headers: {
            cookie: sessionCookie,
            origin,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            csrf,
            action: 'replace',
            username: 'owner@example.test',
            password: 'private-password',
          }),
        }),
        env,
        burstDependencies,
      );
    assert.equal((await submit('https://foreign.example.test')).status, 403);
    const saved = await submit();
    assert.equal(saved.status, 200, `credential attempt ${attempt + 1}`);
    assert.equal(
      (await submit()).status,
      403,
      'the just-used CSRF token cannot be replayed',
    );
    sessionCookie = cookieValue(saved);
    html = await saved.text();
    assert.doesNotMatch(html, /private-password/u);
  }
  assert.equal(validations, 65);
  const replay = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      method: 'POST',
      headers: {
        cookie: firstCookie,
        origin: 'https://mcp.example.test',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: firstCsrf,
        action: 'replace',
        username: 'owner@example.test',
        password: 'private-password',
      }),
    }),
    env,
    burstDependencies,
  );
  assert.equal(
    replay.status,
    403,
    'old consumed tokens remain rejected after more than 32 submissions',
  );
  assert.equal(
    validations,
    65,
    'replay must not revalidate or replace credentials',
  );
  const currentCsrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(currentCsrf);
  context.mock.method(storage, 'put', async () => {
    throw new Error('storage unavailable');
  });
  await assert.rejects(
    handleOnboardingRequest(
      new Request('https://mcp.example.test/connect', {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          origin: 'https://mcp.example.test',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf: currentCsrf,
          action: 'replace',
          username: 'owner@example.test',
          password: 'private-password',
        }),
      }),
      env,
      burstDependencies,
    ),
    /storage unavailable/u,
  );
  assert.equal(
    validations,
    65,
    'replay-history storage failure must stop before provider work',
  );
  assert.equal(
    [...values.keys()].some((key) => key.startsWith('validation:')),
    false,
  );
});

test('credential portal does not accept an unbound browser callback', async () => {
  assert.equal(
    loadOnboardingConfig(env).publicUrl.href,
    'https://mcp.example.test/mcp',
  );
  assert.throws(
    () =>
      loadOnboardingConfig({
        ...env,
        NEMLIG_MCP_ONBOARDING_SESSION_KEY: 'short',
      }),
    /configuration is invalid/u,
  );
  const callback = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect/callback?code=old'),
    env,
    dependencies,
  );
  assert.equal(callback.status, 401);
});

test('credential portal accepts a standard bearer token and keeps provider state separate', async () => {
  connected = false;
  const anonymous = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect'),
    env,
    dependencies,
  );
  assert.equal(anonymous.status, 200);
  assert.match(await anonymous.text(), /Sign in/u);
  const invalid = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      headers: { authorization: 'Bearer invalid' },
    }),
    env,
    dependencies,
  );
  assert.equal(invalid.status, 401);
  assert.match(
    invalid.headers.get('www-authenticate') ?? '',
    /resource_metadata=/u,
  );

  const login = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      headers: { authorization: 'Bearer valid-access-token' },
    }),
    env,
    dependencies,
  );
  assert.equal(login.status, 303);
  const sessionCookie = cookieValue(login);
  const portal = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      headers: { cookie: sessionCookie },
    }),
    env,
    dependencies,
  );
  assert.equal(portal.status, 200);
  assert.equal(
    portal.headers.get('referrer-policy'),
    'same-origin',
    'native form POST must retain Origin for the strict server check',
  );
  const html = await portal.text();
  assert.match(html, /autocomplete="current-password"/u);
  assert.doesNotMatch(
    html,
    /authorization_code|client_secret|organization|private-password/u,
  );
  const csrf = html.match(/name="csrf" value="([^"]+)"/u)?.[1];
  assert.ok(csrf);
  for (const origin of [undefined, 'null', 'https://foreign.example.test']) {
    const rejected = await handleOnboardingRequest(
      new Request('https://mcp.example.test/connect', {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          ...(origin ? { origin } : {}),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          csrf,
          action: 'replace',
          username: 'owner@example.test',
          password: 'private-password',
        }),
      }),
      env,
      dependencies,
    );
    assert.equal(rejected.status, 403);
    assert.equal(
      connected,
      false,
      'rejected origins must not reach credential replacement',
    );
  }
  const badCsrf = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: 'https://mcp.example.test',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf: 'wrong',
        action: 'replace',
        username: 'owner@example.test',
        password: 'private-password',
      }),
    }),
    env,
    dependencies,
  );
  assert.equal(badCsrf.status, 403);
  assert.equal(
    connected,
    false,
    'same-origin alone must not authorize credential replacement',
  );
  const saved = await handleOnboardingRequest(
    new Request('https://mcp.example.test/connect', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: 'https://mcp.example.test',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrf,
        action: 'replace',
        username: 'owner@example.test',
        password: 'private-password',
      }),
    }),
    env,
    dependencies,
  );
  assert.equal(saved.status, 200);
  assert.equal(connected, true);
  assert.doesNotMatch(await saved.text(), /private-password/u);
});
