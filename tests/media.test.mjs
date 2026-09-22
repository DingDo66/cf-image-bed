import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
async function moduleAt(path) {
  const { outputFiles } = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(outputFiles[0].text).toString("base64")
  );
}
const trash = await moduleAt("worker/trash.ts"),
  remote = await moduleAt("worker/url-upload.ts");
const migrations = await Promise.all(
  ["0001_initial.sql", "0002_media_tools.sql"].map((n) =>
    readFile("migrations/" + n, "utf8"),
  ),
);
function environment() {
  const db = new DatabaseSync(":memory:");
  db.exec(migrations[0]);
  db.exec(
    "INSERT INTO albums VALUES ('old-album','Old album','','2020-01-01'); INSERT INTO images (id,name,size,mime,original_key,album_id,created_at) VALUES ('old','old.png',1,'image/png','old.png','old-album','2020-01-01');",
  );
  db.exec(migrations[1]);
  const deleted = [];
  const prepare = (sql) => {
    let values = [];
    return {
      bind(...v) {
        values = v;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...values) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...values) };
      },
      async run() {
        return {
          meta: { changes: Number(db.prepare(sql).run(...values).changes) },
        };
      },
    };
  };
  return {
    db,
    deleted,
    env: {
      DB: { prepare },
      IMAGES: { delete: async (keys) => deleted.push(...keys) },
    },
  };
}
test("migration retains old image IDs, original keys, tags and album foreign keys", () => {
  const { db } = environment();
  const row = db.prepare("SELECT * FROM images WHERE id=?").get("old");
  assert.equal(row.original_key, "old.png");
  assert.equal(row.album_id, "old-album");
  assert.equal(row.favorite, 0);
  db.exec("DELETE FROM albums WHERE id='old-album'");
  assert.equal(
    db.prepare("SELECT album_id FROM images WHERE id='old'").get().album_id,
    null,
  );
  db.close();
});
test("scheduled cleanup only purges expired images and retries storage failures", async () => {
  const { db, env, deleted } = environment();
  db.prepare(
    "UPDATE images SET deleted_at=?,preview_key='old.jpg' WHERE id='old'",
  ).run(new Date(Date.now() - 31 * 86400000).toISOString());
  db.exec(
    "INSERT INTO images (id,name,size,mime,original_key,created_at,deleted_at) VALUES ('fresh','fresh.png',1,'image/png','fresh.png','2020',datetime('now'))",
  );
  const result = await (await trash.purgeBatch(env, true)).json();
  assert.equal(result.removed, 1);
  assert.ok(deleted.includes("previews/old.jpg"));
  assert.ok(db.prepare("SELECT id FROM images WHERE id='fresh'").get());
  env.IMAGES.delete = async () => {
    throw new Error("simulated R2 outage");
  };
  await assert.rejects(trash.purgeImage(env, "fresh"));
  await assert.rejects(trash.restoreImage(env, "fresh"));
  assert.ok(
    db.prepare("SELECT purge_started_at FROM images WHERE id='fresh'").get()
      .purge_started_at,
  );
  env.IMAGES.delete = async () => {};
  await trash.purgeBatch(env, true);
  assert.equal(db.prepare("SELECT count(*) AS n FROM images").get().n, 0);
  db.close();
});
test("expired images cannot be restored; live images cannot be purged", async () => {
  const { db, env } = environment();
  await assert.rejects(trash.purgeImage(env, "old"));
  db.prepare("UPDATE images SET deleted_at=?").run(
    new Date(Date.now() - 31 * 86400000).toISOString(),
  );
  await assert.rejects(trash.restoreImage(env, "old"));
  db.close();
});
test("URL fetching rejects non-images, excessive sizes, failures and unsafe redirects", async () => {
  const original = globalThis.fetch;
  const request = () =>
    new Request("http://localhost/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/photo" }),
    });
  const dns = () =>
    Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
  try {
    for (const response of [
      () => new Response("<html>hello</html>"),
      () =>
        new Response("x", {
          headers: { "Content-Length": String(21 * 1024 * 1024) },
        }),
      () => new Response("bad", { status: 500 }),
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret" },
        }),
    ]) {
      globalThis.fetch = async (url) =>
        String(url).includes("dns-query") ? dns() : response();
      await assert.rejects(remote.uploadURL(request(), {}));
    }
    globalThis.fetch = async () =>
      Response.json({ Answer: [{ type: 1, data: "10.0.0.1" }] });
    await assert.rejects(remote.uploadURL(request(), {}));
  } finally {
    globalThis.fetch = original;
  }
});

test('URL timeout is reported clearly and streaming limits cannot be bypassed', async () => {
  const originalFetch = globalThis.fetch, originalTimer = globalThis.setTimeout;
  const request = () => new Request('https://gallery.example/api/upload-url', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/image'})});
  try {
    globalThis.setTimeout = callback => originalTimer(callback, 1);
    globalThis.fetch = async (_url, options) => new Promise((resolve,reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), {once:true}));
    await assert.rejects(remote.uploadURL(request(), {}), /timed out/);
    globalThis.setTimeout = originalTimer;
    globalThis.fetch = async url => String(url).includes('dns-query') ? Response.json({Answer:[{type:1,data:'93.184.216.34'}]}) : new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(21*1024*1024));controller.close();}}));
    await assert.rejects(remote.uploadURL(request(), {}), error => error.status === 413);
  } finally { globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer; }
});
