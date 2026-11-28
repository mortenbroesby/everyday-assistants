// Bounded two-turn native trial. Emit stages and tool names only.
import process from "node:process";
import console from "node:console";
import { setTimeout, clearTimeout } from "node:timers";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once, EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { withConversationFixture } from "./conversation-fixture.mjs";
import { verifyConversationWidget } from "./conversation-widget.mjs";

const policy = { type: "readOnly", networkAccess: false };
const fixtureName = "grocery_conversation";
function nativeClient(url) {
  const child = spawn(
    "codex",
    [
      "app-server",
      "--stdio",
      "-c",
      "features.apps=false",
      "-c",
      "features.plugins=false",
      "-c",
      'web_search="disabled"',
      "-c",
      `mcp_servers.${fixtureName}.url=${JSON.stringify(url)}`,
      // Only this synthetic fixture may create a process-local draft.
      "-c",
      `mcp_servers.${fixtureName}.tools.start_product_review.approval_mode="approve"`,
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  const stopped = once(child, "close");
  const events = new EventEmitter();
  const pending = new Map();
  let id = 0;
  let closed = false;
  function stop() {
    closed = true;
    for (const reply of pending.values()) {
      reply.reject(new Error("Native host disconnected"));
    }
    pending.clear();
    events.emit("disconnected");
  }
  child.once("error", stop);
  child.once("close", stop);
  child.stdin.on("error", stop);
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method && message.id !== undefined) {
      console.log("Unsupported native request", message.method);
      send({
        id: message.id,
        error: { code: -32601, message: "Unsupported host request" },
      });
    } else if (message.method) {
      events.emit("notification:" + message.method, message.params);
    } else {
      const reply = pending.get(message.id);
      if (reply) {
        pending.delete(message.id);
        if (message.error) {
          reply.reject(new Error("Host rejected " + reply.method));
        } else {
          reply.resolve(message.result);
        }
      }
    }
  });
  function request(method, params) {
    assert.ok(!closed, "Native host unavailable");
    const number = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(number);
        reject(new Error("Timeout during " + method));
      }, 30000);
      pending.set(number, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      send({ id: number, method, params });
    });
  }
  return {
    events,
    send,
    request,
    async close() {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      try {
        await stopped;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function proveSandbox(host, url, cwd) {
  const marker = join(cwd, "canary");
  await writeFile(marker, "original");
  const probe = async (script, sandboxPolicy) =>
    host.request("command/exec", {
      command: [process.execPath, "-e", script],
      sandboxPolicy,
      cwd,
      timeoutMs: 5000,
    });
  const connect = `fetch(${JSON.stringify(url)}).then(()=>process.exit(0)).catch(e=>{console.error(e.cause?.code);process.exit(1)})`;
  assert.equal(
    (await probe(connect, { type: "dangerFullAccess" })).exitCode,
    0,
    "Loopback canary unavailable",
  );
  const denied = await probe(connect, policy);
  assert.notEqual(denied.exitCode, 0, "Sandbox allowed loopback");
  assert.match(denied.stderr, /EPERM|EACCES/);
  assert.equal(
    (
      await probe(
        'process.stdout.write(require("fs").readFileSync("canary"))',
        policy,
      )
    ).stdout,
    "original",
  );
  const write = await probe(
    'require("fs").writeFileSync("canary","modified")',
    policy,
  );
  assert.notEqual(write.exitCode, 0, "Sandbox allowed file write");
  assert.match(write.stderr, /EPERM|EACCES|Read-only file system/);
  assert.equal(await readFile(marker, "utf8"), "original");
}

async function turn(host, threadId, text) {
  const signal = globalThis.AbortSignal.timeout(150000);
  const items = [];
  const observe = (event) => {
    if (event.threadId === threadId) {
      items.push(event.item);
    }
  };
  host.events.on("notification:item/completed", observe);
  const completion = Promise.race([
    once(host.events, "notification:turn/completed", { signal }).then(
      ([event]) => event,
    ),
    once(host.events, "disconnected", { signal }).then(() => {
      throw Error("Native host disconnected during turn");
    }),
  ]);
  completion.catch(() => {});
  try {
    const started = await host.request("turn/start", {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
    });
    const event = await completion;
    assert.equal(event.threadId, threadId);
    assert.equal(event.turn.id, started.turn.id);
    assert.equal(event.turn.status, "completed", "Native turn incomplete");
    for (const item of items) {
      assert.ok(
        ["userMessage", "agentMessage", "reasoning", "mcpToolCall"].includes(
          item.type,
        ),
        "Unexpected turn action: " + item.type,
      );
      if (item.type === "mcpToolCall") {
        assert.equal(item.server, fixtureName);
        const reason = item.error?.message ?? "";
        const category = /approval|denied|permission/i.test(reason)
          ? "permission"
          : /argument|schema|validation/i.test(reason)
            ? "arguments"
            : "unclassified";
        assert.equal(
          item.status,
          "completed",
          `Failed tool: ${item.tool} (${category})`,
        );
        assert.ok(
          item.result && item.result.isError !== true,
          "Missing or unsuccessful tool result: " + item.tool,
        );
        console.log("Tool", item.tool);
      }
    }
    return items.filter((item) => item.type === "mcpToolCall");
  } finally {
    host.events.off("notification:item/completed", observe);
  }
}

async function journey({ url }) {
  const cwd = await mkdtemp(join(tmpdir(), "nemlig-model-"));
  const host = nativeClient(url);
  try {
    const initialized = await host.request("initialize", {
      clientInfo: { name: "nemlig-conversation", version: "1" },
      capabilities: { experimentalApi: true },
    });
    host.send({ method: "initialized" });
    const { account } = await host.request("account/read", {
      refreshToken: false,
    });
    assert.equal(
      account?.type,
      "chatgpt",
      "An existing native ChatGPT sign-in is required",
    );
    const { config } = await host.request("config/read", {});
    assert.equal(config.web_search, "disabled");
    const overrides = {};
    for (const name of Object.keys(config.mcp_servers ?? {})) {
      if (name !== fixtureName) {
        overrides[`mcp_servers.${name}.enabled`] = false;
      }
    }
    const models = await host.request("model/list", {});
    const model =
      process.env.NEMLIG_EVAL_MODEL ??
      models.data.find((entry) => entry.isDefault)?.model;
    assert.ok(model, "Select an available model using NEMLIG_EVAL_MODEL");
    const thread = await host.request("thread/start", {
      model,
      cwd,
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: overrides,
    });
    assert.deepEqual(thread.sandbox, policy);
    assert.equal(thread.approvalPolicy, "never");
    console.log("Native host", initialized.userAgent, "model", thread.model);
    const threadId = thread.thread.id;
    const catalog = await host.request("mcpServerStatus/list", {
      threadId,
      detail: "toolsAndAuthOnly",
    });
    assert.equal(catalog.nextCursor, null);
    assert.ok(
      catalog.data.some(
        (server) =>
          server.name === fixtureName && server.tools.show_product_review,
      ),
      "Fixture tools unavailable",
    );
    assert.ok(
      catalog.data.every(
        (server) =>
          server.name === fixtureName || Object.keys(server.tools).length === 0,
      ),
      "Additional MCP tools are exposed",
    );
    await proveSandbox(host, url, cwd);
    const first = await turn(host, threadId, "Lav en kladde med havredrik.");
    const starts = first.filter((item) => item.tool === "start_product_review");
    assert.equal(starts.length, 1, "Expected exactly one draft creation");
    const review = starts[0].result?.structuredContent?.review;
    assert.ok(review?.draftId && review.reviewContextId);
    const second = await turn(host, threadId, "Vis mig listen.");
    assert.deepEqual(
      second.map((item) => item.tool),
      ["show_product_review"],
    );
    const [shown] = second;
    assert.equal(shown.arguments.draft_id, review.draftId);
    assert.equal(shown.arguments.review_context_id, review.reviewContextId);
    assert.equal(
      shown.result?.structuredContent?.review?.draftId,
      review.draftId,
    );
    assert.equal(
      shown.result.structuredContent.review.reviewContextId,
      review.reviewContextId,
    );
    // Native McpToolCallResult serializes an absent _meta as null. MCP Apps
    // accepts an omitted _meta or an object; keep all actual metadata intact.
    const widgetResult = { ...shown.result };
    if (widgetResult._meta === null) {
      delete widgetResult._meta;
    }
    await verifyConversationWidget({
      url,
      result: CallToolResultSchema.parse(widgetResult),
    });
  } finally {
    try {
      await host.close();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
}
await withConversationFixture(journey, 400000);
console.log("PASS: native conversation, widget readback and fixture counters.");
