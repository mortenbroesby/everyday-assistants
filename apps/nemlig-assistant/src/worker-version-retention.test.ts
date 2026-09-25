import assert from "node:assert/strict";
import test from "node:test";
import { collectWorkerVersions, executeWorkerVersionRetention, parseProtectedVersionIds, parseWorkerVersionsPage, planWorkerVersionRetention, recoveryVersionIdsFromJournal, runWranglerCommand } from "../scripts/worker-version-retention.js";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const now = "2026-09-24T12:00:00.000Z";

test("Worker version listing requires complete, strict pagination", async () => {
  const page = (number: number) => ({ success: true, result_info: { page: number, total_pages: 2 }, result: [{ id: ids[number - 1]!, created_on: number === 1 ? "2026-09-20T11:59:59.000Z" : "2026-09-23T12:00:00.000Z" }] });
  assert.deepEqual(parseWorkerVersionsPage(page(1)).versions[0], { id: ids[0], createdOn: "2026-09-20T11:59:59.000Z" });
  assert.deepEqual(await collectWorkerVersions(async (number) => page(number)), [
    { id: ids[0], createdOn: "2026-09-20T11:59:59.000Z" },
    { id: ids[1], createdOn: "2026-09-23T12:00:00.000Z" },
  ]);
  await assert.rejects(() => collectWorkerVersions(async () => page(1)), /worker_version_retention_pagination_changed/u);
  assert.throws(() => parseWorkerVersionsPage({ success: true, result: [], result_info: { page: 2, total_pages: 1 } }), /worker_version_retention_pagination_invalid/u);
  assert.deepEqual(parseWorkerVersionsPage({
    success: true,
    result: [],
    result_info: { page: 1, total_pages: 0 },
  }), { versions: [], page: 1, totalPages: 1 });
  assert.deepEqual(parseWorkerVersionsPage({
    success: true,
    result: [],
    result_info: { page: 0, per_page: 0, count: 0, total_count: 0, total_pages: 0 },
  }), { versions: [], page: 1, totalPages: 1 });
  assert.equal(parseWorkerVersionsPage({
    success: true,
    result: [{ id: ids[0], created_on: "2026-09-20T11:59:59.000Z" }],
    result_info: { page: 0, total_pages: 0 },
  }).versions[0]?.id, ids[0]);
  assert.equal(parseWorkerVersionsPage({
    success: true,
    result: [{ id: ids[0], created_on: "2026-09-20T11:59:59.000Z" }],
    result_info: { page: 1 },
  }).versions[0]?.id, ids[0]);
  assert.throws(() => parseWorkerVersionsPage({
    success: true,
    result_info: { page: 1, total_pages: 1, count: 2, total_count: 2, per_page: 100 },
    result: [{ id: ids[0], created_on: "2026-09-20T11:59:59.000Z" }],
  }), /worker_version_retention_cardinality_invalid/u);
});

test("Worker recovery references come from the deployment journal", () => {
  const journal = JSON.stringify({
    schema: 2,
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    commit: "a".repeat(40),
    ciRunId: 1,
    releaseRunId: 1,
    releaseRunAttempt: 1,
    startedAt: "2026-09-24T12:00:00.000Z",
    lastVerifiedState: "enabled",
    rollback: "not_needed",
    outcome: "success",
    checks: [],
    transitions: [],
    startingVersion: ids[0],
    disabledVersion: ids[1],
    enabledVersion: ids[2],
  });
  assert.deepEqual(recoveryVersionIdsFromJournal(journal), ids);
});

test("Wrangler runs from the package root where its dependency is installed", async () => {
  const output = await runWranglerCommand(["--version"], process.env, AbortSignal.timeout(10_000), 10_000);
  assert.match(output, /^\d+\.\d+\.\d+/u);
});

test("Worker version policy uses a fixed UTC 48-hour cutoff and protects active/recovery versions", () => {
  assert.deepEqual(parseProtectedVersionIds(`${ids[1]},${ids[1]}`), [ids[1]]);
  const plan = planWorkerVersionRetention([
    { id: ids[0]!, createdOn: "2026-09-22T11:59:59.000Z" },
    { id: ids[1]!, createdOn: "2026-09-20T00:00:00.000Z" },
    { id: ids[2]!, createdOn: "2026-09-22T12:00:00.000Z" },
  ], now, [ids[1]!]);
  assert.equal(plan.cutoff, "2026-09-22T12:00:00.000Z");
  assert.deepEqual(plan.protectedIds, [ids[1]]);
  assert.deepEqual(plan.candidates.map(({ id }) => id), [ids[0]]);
});

test("Worker version deletion rechecks protection and readback without retrying uncertainty", async () => {
  let versions = [
    { id: ids[0]!, createdOn: "2026-09-20T00:00:00.000Z" },
    { id: ids[1]!, createdOn: "2026-09-23T00:00:00.000Z" },
  ];
  const plan = planWorkerVersionRetention(versions, now, [ids[1]!]);
  const deleted: string[] = [];
  const report = await executeWorkerVersionRetention(plan, {
    list: async () => versions,
    protectedIds: async () => [ids[1]!],
    delete: async (id) => { deleted.push(id); versions = versions.filter((version) => version.id !== id); },
  });
  assert.deepEqual(deleted, [ids[0]]);
  assert.deepEqual(report.deleted, [ids[0]]);
  assert.equal(report.cleanupComplete, true);

  const protectedPlan = planWorkerVersionRetention([{ id: ids[0]!, createdOn: "2026-09-20T00:00:00.000Z" }], now, []);
  await assert.rejects(() => executeWorkerVersionRetention(protectedPlan, {
    list: async () => [{ id: ids[0]!, createdOn: "2026-09-20T00:00:00.000Z" }],
    protectedIds: async () => [ids[0]!],
    delete: async () => assert.fail("protected version must not be deleted"),
  }), /worker_version_retention_state_changed/u);

  await assert.rejects(() => executeWorkerVersionRetention(planWorkerVersionRetention([
    { id: ids[0]!, createdOn: "2026-09-20T00:00:00.000Z" },
  ], now, []), {
    list: async () => [{ id: ids[0]!, createdOn: "2026-09-20T00:00:00.000Z" }],
    protectedIds: async () => [],
    delete: async () => undefined,
  }), /worker_version_retention_delete_readback_uncertain/u);
});
