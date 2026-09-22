import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { collectImageIds, runImageBatch } from "../src/selectionOps.ts";

for (const pageSize of [48, 100]) {
  test(`select all traverses every ${pageSize}-image page`, async () => {
    const images = Array.from({ length: 157 }, (_, index) => ({
      id: `image-${index}`,
    }));
    const signal = new AbortController().signal;
    const offsets = [];
    const selected = await collectImageIds(async (offset, requestSignal) => {
      assert.equal(requestSignal, signal);
      offsets.push(offset);
      return {
        images: images.slice(offset, offset + pageSize),
        total: images.length,
      };
    }, signal);

    assert.deepEqual(
      [...selected],
      images.map(({ id }) => id),
    );
    assert.deepEqual(offsets, pageSize === 48 ? [0, 48, 96, 144] : [0, 100]);
  });
}

test("select all deduplicates IDs returned on multiple pages", async () => {
  const rows = Array.from({ length: 160 }, (_, index) => ({
    id: `image-${index === 55 || index === 110 ? 13 : index}`,
  }));
  const selected = await collectImageIds(
    async (offset) => ({
      images: rows.slice(offset, offset + 48),
      total: rows.length,
    }),
    new AbortController().signal,
  );

  assert.equal(selected.size, 158);
  assert.deepEqual(selected, new Set(rows.map(({ id }) => id)));
  assert.ok(selected.has("image-159"));
});

test("select all stops on an empty page if the result count has changed", async () => {
  const offsets = [];
  const selected = await collectImageIds(async (offset) => {
    offsets.push(offset);
    return {
      images: offset === 0 ? [{ id: "remaining-image" }] : [],
      total: 200,
    };
  }, new AbortController().signal);

  assert.deepEqual([...selected], ["remaining-image"]);
  assert.deepEqual(offsets, [0, 1]);
});

test("select all does not request a page after cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;

  await assert.rejects(
    collectImageIds(async () => {
      calls += 1;
      return { images: [], total: 0 };
    }, controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
});

test("select all discards an in-flight result after cancellation", async () => {
  const controller = new AbortController();
  const offsets = [];

  await assert.rejects(
    collectImageIds(async (offset) => {
      offsets.push(offset);
      if (offset > 0) controller.abort();
      return { images: [{ id: `image-${offset}` }], total: 200 };
    }, controller.signal),
    { name: "AbortError" },
  );
  assert.deepEqual(offsets, [0, 1]);
});

test("batch management caps concurrency at four and reports partial failures", async () => {
  const ids = Array.from({ length: 13 }, (_, index) => `image-${index}`);
  const failures = new Set(["image-1", "image-7"]);
  const signal = new AbortController().signal;
  const calls = [];
  const progress = [];
  let active = 0;
  let peak = 0;

  const result = await runImageBatch(
    ids,
    async (id, requestSignal) => {
      assert.equal(requestSignal, signal);
      calls.push(id);
      active += 1;
      peak = Math.max(peak, active);
      try {
        await setImmediate();
        if (failures.has(id)) throw new Error(`Unable to update ${id}`);
      } finally {
        active -= 1;
      }
    },
    signal,
    (completed) => progress.push(completed),
  );

  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.deepEqual(calls.toSorted(), ids.toSorted());
  assert.deepEqual(result.failed.toSorted(), [...failures].toSorted());
  assert.deepEqual(
    result.succeeded.toSorted(),
    ids.filter((id) => !failures.has(id)).toSorted(),
  );
  assert.equal(result.firstError, "Unable to update image-1");
  assert.deepEqual(
    progress,
    Array.from({ length: ids.length }, (_, i) => i + 1),
  );
});

test("batch management mutates each selected ID only once", async () => {
  const calls = [];
  const progress = [];
  const result = await runImageBatch(
    ["image-a", "image-b", "image-a", "image-c", "image-b"],
    async (id) => calls.push(id),
    new AbortController().signal,
    (completed) => progress.push(completed),
  );

  assert.deepEqual(calls.toSorted(), ["image-a", "image-b", "image-c"]);
  assert.deepEqual(result.succeeded.toSorted(), [
    "image-a",
    "image-b",
    "image-c",
  ]);
  assert.deepEqual(result.failed, []);
  assert.equal(result.firstError, "");
  assert.deepEqual(progress, [1, 2, 3]);
});

test("cancelling a batch prevents queued image mutations from starting", async () => {
  const controller = new AbortController();
  const calls = [];
  let finishActive;
  const activeGate = new Promise((resolve) => {
    finishActive = resolve;
  });
  const pending = runImageBatch(
    Array.from({ length: 12 }, (_, index) => `image-${index}`),
    async (id, signal) => {
      calls.push(id);
      await activeGate;
      signal.throwIfAborted();
    },
    controller.signal,
    () => {},
  );

  assert.deepEqual(calls, ["image-0", "image-1", "image-2", "image-3"]);
  controller.abort();
  const rejected = assert.rejects(pending, { name: "AbortError" });
  finishActive();
  await rejected;
  assert.deepEqual(calls, ["image-0", "image-1", "image-2", "image-3"]);
});

test("an already cancelled batch does not mutate any image", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  let progressCalls = 0;

  await assert.rejects(
    runImageBatch(
      ["image-a"],
      async () => {
        calls += 1;
      },
      controller.signal,
      () => {
        progressCalls += 1;
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
  assert.equal(progressCalls, 0);
});

test("an empty selection completes without mutations or progress", async () => {
  let calls = 0;
  let progressCalls = 0;
  const result = await runImageBatch(
    [],
    async () => {
      calls += 1;
    },
    new AbortController().signal,
    () => {
      progressCalls += 1;
    },
  );

  assert.deepEqual(result, { succeeded: [], failed: [], firstError: "" });
  assert.equal(calls, 0);
  assert.equal(progressCalls, 0);
});
