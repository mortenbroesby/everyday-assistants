import assert from "node:assert/strict";
import test from "node:test";
import { runReadPool } from "./read-coordination.js";

test("read pool starts inputs in order, preserves result order, and honors adjustable concurrency", async () => {
  const starts: number[] = [];
  let active = 0;
  let maximum = 0;
  const result = await runReadPool([1, 2, 3, 4], async (value) => {
    starts.push(value);
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5 - value));
    active -= 1;
    return value * 10;
  }, { concurrency: 2 });
  assert.deepEqual(starts, [1, 2, 3, 4]);
  assert.deepEqual(result, [10, 20, 30, 40]);
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});

test("read pool rejects invalid concurrency before starting work", async () => {
  let starts = 0;
  await assert.rejects(runReadPool([1], async (value) => { starts += 1; return value; }, { concurrency: 0 }), /positive integer/);
  assert.equal(starts, 0);
});

test("read pool stops queued work and waits for active reads after cancellation", async () => {
  const controller = new AbortController();
  const reason = new Error("cancel pool");
  const starts: number[] = [];
  let active = 0;
  const pending = runReadPool([1, 2, 3, 4], (value, signal) => new Promise<number>((resolve, reject) => {
    starts.push(value);
    active += 1;
    const timer = setTimeout(() => { active -= 1; resolve(value); }, 40);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      setTimeout(() => { active -= 1; reject(signal.reason); }, 2);
    }, { once: true });
  }), { signal: controller.signal, concurrency: 2 });
  setTimeout(() => controller.abort(reason), 2);
  await assert.rejects(pending, (error) => error === reason);
  assert.deepEqual(starts, [1, 2]);
  assert.equal(active, 0);
});
