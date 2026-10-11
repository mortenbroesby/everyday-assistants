import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { handleLocalBasketStateRequest } from "./local-basket-callback.js";
import { attachLocalBasketCapability } from "./local-basket-capability.js";
import { createOwnerLocalBasketInventory } from "./local-basket.js";
import type { LocalBasketStorageAccess } from "./local-basket-storage.js";
import { mutateOwnerLocalBasketInventory } from "./local-basket-storage.js";

const principalKey = "a".repeat(32);
const requireFromHere = createRequire(import.meta.url);
const wranglerRequire = createRequire(
  requireFromHere.resolve("wrangler/package.json"),
);

interface WorkersRuntime {
  dispatchFetch(input: string, init: RequestInit): Promise<Response>;
  dispose(): Promise<void>;
}

const workersRuntimeModules = () => {
  const { build } = wranglerRequire("esbuild") as {
    build(options: Record<string, unknown>): Promise<{
      outputFiles: Array<{ text: string }>;
    }>;
  };
  const { Miniflare, convertV4MiniflareOptions } = wranglerRequire(
    "miniflare",
  ) as {
    Miniflare: new (options: unknown) => WorkersRuntime;
    convertV4MiniflareOptions(options: unknown): unknown;
  };
  return { build, Miniflare, convertV4MiniflareOptions };
};

const runWorkersSelection = async (): Promise<Response> => {
  const { build, Miniflare, convertV4MiniflareOptions } =
    workersRuntimeModules();
  const result = await build({
    stdin: {
      contents: `
        import { handleLocalBasketStateRequest } from "./local-basket-callback.ts";
        const storage = {
          idFromName: (ownerId: string) => ownerId,
          get: () => ({ mutate: async () => undefined }),
        };
        export default {
          fetch(request: Request) {
            return handleLocalBasketStateRequest(
              request,
              storage,
              async (capability) => capability === "cap" ? "${principalKey}" : undefined,
            );
          },
        };
      `,
      resolveDir: new URL(".", import.meta.url).pathname,
      sourcefile: "local-basket-workers-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: "2026-08-31",
      compatibilityFlags: ["nodejs_compat"],
      script: result.outputFiles[0]!.text,
    }),
  );
  try {
    return await runtime.dispatchFetch(
      "http://local-basket-state.internal/inventory",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nemlig-local-basket-capability": "cap",
        },
        body: JSON.stringify({ kind: "selection", selectionKey: "session" }),
      },
    );
  } finally {
    await runtime.dispose();
  }
};

test("Local basket callback requires a live Worker capability before storage", async () => {
  let storageCalls = 0;
  const storage = {
    idFromName: (ownerId: string) => {
      storageCalls += 1;
      return ownerId;
    },
    get: () => {
      storageCalls += 1;
      return {
        read: async () => createOwnerLocalBasketInventory(principalKey),
        mutate: async () => undefined,
      };
    },
  };

  const response = await handleLocalBasketStateRequest(
    new Request("http://local-basket-state.internal/inventory"),
    storage,
    async () => undefined,
  );

  assert.equal(response.status, 403);
  assert.equal(storageCalls, 0);
});

test("Local basket callback derives storage identity from capability, not request data", async () => {
  const names: string[] = [];
  const storage = {
    idFromName: (ownerId: string) => {
      names.push(ownerId);
      return ownerId;
    },
    get: () => ({
      read: async (ownerId: string) => createOwnerLocalBasketInventory(ownerId),
      mutate: async () => [],
    }),
  };
  const request = new Request("http://local-basket-state.internal/inventory", {
    headers: { "x-owner-id": "forged-owner" },
  });

  const response = await handleLocalBasketStateRequest(
    attachLocalBasketCapability(request, "container-owned-capability"),
    storage,
    async (capability) =>
      capability === "container-owned-capability" ? principalKey : undefined,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);

  assert.deepEqual(names, [principalKey]);
});

test("Local basket callback rejects credential-bearing egress before storage", async () => {
  let storageCalls = 0;
  const storage = {
    idFromName: () => {
      storageCalls += 1;
      return principalKey;
    },
    get: () => {
      storageCalls += 1;
      return {
        read: async () => createOwnerLocalBasketInventory(principalKey),
        mutate: async () => undefined,
      };
    },
  };
  const request = new Request("http://local-basket-state.internal/inventory", {
    headers: { authorization: "Bearer synthetic-secret" },
  });

  const response = await handleLocalBasketStateRequest(
    attachLocalBasketCapability(request, "container-owned-capability"),
    storage,
    async () => principalKey,
  );
  assert.equal(response.status, 403);

  assert.equal(storageCalls, 0);
});

test("Local basket callback validates and strips product snapshot authority", async () => {
  let persisted: unknown;
  const storage = {
    idFromName: (ownerId: string) => ownerId,
    get: () => ({
      read: async (ownerId: string) => createOwnerLocalBasketInventory(ownerId),
      mutate: async (_ownerId: string, command: unknown) => {
        persisted = command;
        return { accepted: true };
      },
    }),
  };
  const post = (view: Record<string, unknown>) =>
    new Request("http://local-basket-state.internal/inventory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "create",
        lines: [{ productId: 7, quantity: 1, view }],
      }),
    });
  const owner = async () => principalKey;
  const capability = "container-owned-capability";
  const safeView = {
    context: "details",
    status: "complete",
    product: {
      id: 7,
      name: "Fixture",
      labels: [],
      tags: [],
      credential: "must-not-persist",
    },
    authority: { token: "must-not-persist" },
  };

  const accepted = await handleLocalBasketStateRequest(
    attachLocalBasketCapability(post(safeView), capability),
    storage,
    owner,
  );
  assert.equal(accepted.status, 200);
  const cleanView = (
    persisted as {
      lines: Array<{ view: Record<string, unknown> }>;
    }
  ).lines[0]!.view;
  assert.equal("authority" in cleanView, false);
  assert.equal(
    "credential" in (cleanView.product as Record<string, unknown>),
    false,
  );

  persisted = undefined;
  const rejected = await handleLocalBasketStateRequest(
    attachLocalBasketCapability(
      post({ ...safeView, status: "pending" }),
      capability,
    ),
    storage,
    owner,
  );
  assert.equal(rejected.status, 400);
  assert.equal(persisted, undefined);
});

test("callback serializes an absent selection as JSON null", async () => {
  const response = await handleLocalBasketStateRequest(
    attachLocalBasketCapability(
      new Request("http://local-basket-state.internal/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "selection", selectionKey: "session" }),
      }),
      "container-owned-capability",
    ),
    {
      idFromName: (ownerId: string) => ownerId,
      get: () => ({ mutate: async () => undefined }),
    },
    async () => principalKey,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});

test(
  "Workers callback keeps an absent selection JSON-readable",
  { timeout: 30_000 },
  async () => {
    const response = await runWorkersSelection();

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "null");
  },
);

test("callback returns JSON-safe acknowledgements after committed deletion", async () => {
  const values = new Map<string, unknown>();
  const storage = {
    idFromName: (ownerId: string) => ownerId,
    get: () => ({
      mutate: async (
        ownerId: string,
        command: Parameters<typeof mutateOwnerLocalBasketInventory>[2],
      ) => {
        const access: LocalBasketStorageAccess = {
          async get<T>(key: string) {
            return values.get(key) as T | undefined;
          },
          async put<T>(key: string, value: T) {
            values.set(key, structuredClone(value));
          },
          async delete(key: string) {
            values.delete(key);
          },
          async setAlarm() {},
          async deleteAlarm() {},
        };
        return mutateOwnerLocalBasketInventory(
          {
            ...access,
            async transaction<T>(
              action: (tx: LocalBasketStorageAccess) => Promise<T>,
            ) {
              return action(access);
            },
          },
          ownerId,
          command,
        );
      },
    }),
  };
  const request = (body: unknown) =>
    attachLocalBasketCapability(
      new Request("http://local-basket-state.internal/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      "container-owned-capability",
    );
  const call = (body: unknown) =>
    handleLocalBasketStateRequest(
      request(body),
      storage,
      async () => principalKey,
    );
  const view = {
    context: "details",
    status: "complete",
    product: { id: 17, name: "Fixture", labels: [], tags: [] },
  };
  const createdResponse = await call({
    kind: "create",
    lines: [{ productId: 17, quantity: 1, view }],
  });
  assert.equal(createdResponse.status, 200);
  const created = (await createdResponse.json()) as {
    basket: { basketId: string };
  };

  const deletedResponse = await call({
    kind: "delete",
    basketId: created.basket.basketId,
  });
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), {
    basketId: created.basket.basketId,
    deleted: true,
  });
  assert.equal(values.size, 0);
});

test("callback distinguishes missing baskets, conflicts, and storage failures", async () => {
  const call = (error: Error) =>
    handleLocalBasketStateRequest(
      attachLocalBasketCapability(
        new Request("http://local-basket-state.internal/inventory", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "list" }),
        }),
        "container-owned-capability",
      ),
      {
        idFromName: (ownerId: string) => ownerId,
        get: () => ({
          mutate: async () => {
            throw error;
          },
        }),
      },
      async () => principalKey,
    );

  const missingError = Object.assign(new Error("serialized missing basket"), {
    code: "LOCAL_BASKET_NOT_FOUND",
    name: "LocalBasketNotFoundError",
  });
  const missing = await call(missingError);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "Local basket is unavailable.");

  const conflictError = Object.assign(
    new Error("serialized revision conflict"),
    { code: "LOCAL_BASKET_CONFLICT", name: "LocalBasketConflictError" },
  );
  const conflict = await call(conflictError);
  assert.equal(conflict.status, 409);
  assert.match(await conflict.text(), /changed/u);

  const failed = await call(new Error("private owner detail"));
  assert.equal(failed.status, 500);
  const failureText = await failed.text();
  assert.match(failureText, /temporarily unavailable/u);
  assert.doesNotMatch(failureText, /private owner detail/u);
});
