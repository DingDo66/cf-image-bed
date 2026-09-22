import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

// These tests intentionally exercise Wrangler's real local D1 and R2 bindings.
// Restrict the target so a typo cannot run destructive fixture tests in production.
const base = new URL(process.env.TEST_BASE_URL || "http://localhost:8787");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password ||
  base.pathname !== "/" ||
  base.search ||
  base.hash
) {
  throw new Error(
    "TEST_BASE_URL must be a loopback origin, such as http://localhost:8787.",
  );
}

async function getPassword() {
  if (process.env.TEST_ADMIN_PASSWORD) return process.env.TEST_ADMIN_PASSWORD;
  let contents;
  try {
    contents = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
  } catch {
    throw new Error(
      "Run npm run dev first, or provide TEST_ADMIN_PASSWORD for the local Worker.",
    );
  }
  const line = contents.match(/^\s*ADMIN_PASSWORD\s*=\s*(.*?)\s*$/m);
  if (!line) throw new Error("ADMIN_PASSWORD is missing from .dev.vars.");
  const value = line[1];
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      /* Accept ordinary dotenv quotes below. */
    }
  }
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "");
}

// A valid 1 × 1 PNG, rather than a signature-only synthetic upload.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwTWz+DwAEAQIZ32PJWAAAAABJRU5ErkJggg==",
  "base64",
);

function uploadForm(name, content = png, type = "image/png") {
  const form = new FormData();
  form.append("file", new Blob([content], { type }), name);
  form.append("width", "1");
  form.append("height", "1");
  return form;
}

async function request(path, { cookie, json, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(json);
  }
  return fetch(new URL(path, base), {
    ...options,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
}

async function jsonBody(response, expectedStatus = 200) {
  assert.equal(
    response.status,
    expectedStatus,
    `Unexpected HTTP status for ${new URL(response.url).pathname}`,
  );
  assert.match(
    response.headers.get("Content-Type") || "",
    /application\/json/i,
  );
  return response.json();
}

async function successBody(response) {
  assert.ok(
    response.status === 200 || response.status === 201,
    `Expected success, received HTTP ${response.status}`,
  );
  assert.match(
    response.headers.get("Content-Type") || "",
    /application\/json/i,
  );
  return response.json();
}

test(
  "local Worker: private library, upload lifecycle, public delivery, and session revocation",
  { timeout: 120_000 },
  async (t) => {
    const password = await getPassword();
    const marker = `api-test-${randomUUID()}`;
    const imageIds = new Set();
    const albumIds = new Set();
    let cookie;
    let image;
    let firstAlbum;
    let secondAlbum;

    const authenticated = (path, options = {}) =>
      request(path, { ...options, cookie });
    const trackImage = (body) => {
      if (body?.image?.id) imageIds.add(body.image.id);
      return body;
    };
    const trackAlbum = (body) => {
      if (body?.album?.id) albumIds.add(body.album.id);
      return body;
    };

    try {
      await t.test(
        "anonymous callers cannot enumerate the private library or create assets",
        async () => {
          const session = await jsonBody(await request("/api/session"));
          assert.deepEqual(session, { authenticated: false, configured: true });
          for (const path of ["/api/images", "/api/albums", "/api/stats"]) {
            const response = await request(path);
            const body = await jsonBody(response, 401);
            assert.equal(typeof body.error, "string");
            assert.equal(response.headers.get("Set-Cookie"), null);
            assert.equal(body.images, undefined);
            assert.equal(body.albums, undefined);
          }
          const response = await request("/api/images", {
            method: "POST",
            body: uploadForm(`${marker}-anonymous.png`),
          });
          const body = trackImage(await response.json());
          assert.equal(response.status, 401);
          assert.equal(typeof body.error, "string");
        },
      );

      await t.test(
        "login validates the password and sets an HttpOnly SameSite session cookie",
        async () => {
          const badLogin = await request("/api/login", {
            method: "POST",
            json: { password: `${password}-incorrect` },
            headers: { Origin: base.origin },
          });
          assert.equal(badLogin.status, 401);
          assert.equal(badLogin.headers.get("Set-Cookie"), null);
          const response = await request("/api/login", {
            method: "POST",
            json: { password },
            headers: { Origin: base.origin },
          });
          const body = await jsonBody(response);
          assert.deepEqual(body, { ok: true });
          const setCookie = response.headers.get("Set-Cookie");
          assert.ok(setCookie, "Login must issue a session cookie.");
          assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
          assert.match(setCookie, /;\s*SameSite=(?:Lax|Strict)(?:;|$)/i);
          cookie = setCookie.split(";")[0];
          assert.ok(
            cookie.split("=").slice(1).join("=").length > 16,
            "Session value must be nontrivial.",
          );
          const session = await jsonBody(await authenticated("/api/session"));
          assert.deepEqual(session, { authenticated: true, configured: true });
          assert.equal(JSON.stringify(session).includes(password), false);
        },
      );

      assert.ok(
        cookie,
        "The remaining integration checks require a successful login.",
      );

      await t.test(
        "cross-origin authenticated writes and login are rejected",
        async () => {
          const response = await authenticated("/api/albums", {
            method: "POST",
            json: { name: `${marker}-forbidden` },
            headers: { Origin: "https://attacker.invalid" },
          });
          const body = trackAlbum(await response.json());
          assert.equal(response.status, 403);
          assert.equal(typeof body.error, "string");
          assert.notEqual(
            response.headers.get("Access-Control-Allow-Origin"),
            "https://attacker.invalid",
          );
          const login = await request("/api/login", {
            method: "POST",
            json: { password },
            headers: { Origin: "https://attacker.invalid" },
          });
          assert.equal(login.status, 403);
          assert.equal(login.headers.get("Set-Cookie"), null);
        },
      );

      await t.test("a file pretending to be an image is rejected", async () => {
        const response = await authenticated("/api/images", {
          method: "POST",
          body: uploadForm(
            `${marker}-spoof.png`,
            "<!doctype html><script>alert(1)</script>",
            "image/png",
          ),
        });
        const body = trackImage(await response.json());
        assert.ok(
          [400, 415, 422].includes(response.status),
          `Expected upload validation error, received ${response.status}`,
        );
        assert.equal(typeof body.error, "string");
      });

      await t.test(
        "a real PNG uploads, appears in search, and is included in library statistics",
        async () => {
          const body = trackImage(
            await successBody(
              await authenticated("/api/images", {
                method: "POST",
                body: uploadForm(`${marker}.png`),
              }),
            ),
          );
          image = body.image;
          assert.equal(image.name, `${marker}.png`);
          assert.equal(image.mime, "image/png");
          assert.equal(image.size, png.length);
          assert.equal(image.width, 1);
          assert.equal(image.height, 1);
          assert.equal(image.albumId, null);
          assert.deepEqual(image.tags, []);
          assert.equal(new URL(image.url).pathname.startsWith("/i/"), true);
          assert.ok(
            new URL(image.thumbnailUrl),
            "Thumbnail URL must be absolute.",
          );
          assert.ok(Number.isFinite(Date.parse(image.createdAt)));

          const result = await jsonBody(
            await authenticated(`/api/images?q=${encodeURIComponent(marker)}`),
          );
          assert.equal(result.total, 1);
          assert.equal(result.images[0].id, image.id);
          const recent = await jsonBody(
            await authenticated(
              `/api/images?q=${encodeURIComponent(marker)}&recent=1`,
            ),
          );
          assert.equal(recent.images[0].id, image.id);
          const stats = await jsonBody(await authenticated("/api/stats"));
          assert.ok(stats.totalImages >= 1);
          assert.ok(stats.totalBytes >= png.length);
          assert.equal(typeof stats.totalAlbums, "number");
        },
      );

      await t.test(
        "filename, tags, and description can be edited and searched",
        async () => {
          assert.ok(image);
          const body = await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "PATCH",
              json: {
                name: `${marker}-renamed.png`,
                description: `description-${marker}`,
                tags: [`tag-${marker}`, "integration"],
              },
            }),
          );
          image = body.image;
          assert.equal(image.name, `${marker}-renamed.png`);
          assert.equal(image.description, `description-${marker}`);
          assert.deepEqual(image.tags, [`tag-${marker}`, "integration"]);
          for (const q of [image.name, image.description, `tag-${marker}`]) {
            const result = await jsonBody(
              await authenticated(`/api/images?q=${encodeURIComponent(q)}`),
            );
            assert.equal(result.total, 1);
            assert.equal(result.images[0].id, image.id);
          }
        },
      );

      await t.test(
        "search treats SQL wildcard characters and backslashes literally, including decoded tags and 200-character Unicode queries",
        async () => {
          assert.ok(image);
          const name = `name-${marker}-100%_山野.png`;
          const descriptionToken = `description-${marker}-100%_路径\\终点`;
          const tag = `tag-${marker}-100%_路径\\叶子`;
          const longPrefix = `${marker}-长查询-`;
          const longQuery = longPrefix + "界".repeat(200 - longPrefix.length);
          assert.equal(longQuery.length, 200);
          const body = await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "PATCH",
              json: {
                name,
                description: `${descriptionToken}\n${longQuery}`,
                tags: [tag],
              },
            }),
          );
          image = body.image;
          assert.deepEqual(image.tags, [tag]);

          for (const q of [name, descriptionToken, tag, longQuery]) {
            const result = await jsonBody(
              await authenticated(`/api/images?q=${encodeURIComponent(q)}`),
            );
            assert.equal(
              result.total,
              1,
              "Literal search should find the exact uploaded fixture.",
            );
            assert.equal(result.images[0].id, image.id);
          }
          // These patterns would match if % or _ were interpreted as SQL LIKE wildcards.
          // A doubled slash would match the JSON encoding of a tag, but not its actual value.
          for (const q of [
            `name-${marker}-%`,
            `name-${marker}-100__山野`,
            `description-${marker}-%`,
            `tag-${marker}-%`,
            tag.replace("\\", "\\\\"),
          ]) {
            const result = await jsonBody(
              await authenticated(`/api/images?q=${encodeURIComponent(q)}`),
            );
            assert.equal(
              result.total,
              0,
              "Search must not match wildcard patterns or JSON-escaped tag storage.",
            );
            assert.deepEqual(result.images, []);
          }
        },
      );

      await t.test(
        "albums support create, rename, move, and deletion while retaining images",
        async () => {
          assert.ok(image);
          firstAlbum = trackAlbum(
            await successBody(
              await authenticated("/api/albums", {
                method: "POST",
                json: {
                  name: `${marker}-first`,
                  description: "First integration album",
                },
              }),
            ),
          ).album;
          secondAlbum = trackAlbum(
            await successBody(
              await authenticated("/api/albums", {
                method: "POST",
                json: { name: `${marker}-second` },
              }),
            ),
          ).album;
          assert.equal(firstAlbum.imageCount, 0);
          assert.equal(firstAlbum.coverUrl, null);

          let update = await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "PATCH",
              json: { albumId: firstAlbum.id },
            }),
          );
          assert.equal(update.image.albumId, firstAlbum.id);
          let listing = await jsonBody(
            await authenticated(
              `/api/images?albumId=${encodeURIComponent(firstAlbum.id)}`,
            ),
          );
          assert.equal(listing.total, 1);
          assert.equal(listing.images[0].id, image.id);
          let albums = (await jsonBody(await authenticated("/api/albums")))
            .albums;
          assert.equal(
            albums.find((album) => album.id === firstAlbum.id).imageCount,
            1,
          );
          assert.ok(
            albums.find((album) => album.id === firstAlbum.id).coverUrl,
          );

          update = await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "PATCH",
              json: { albumId: secondAlbum.id },
            }),
          );
          assert.equal(update.image.albumId, secondAlbum.id);
          listing = await jsonBody(
            await authenticated(
              `/api/images?albumId=${encodeURIComponent(firstAlbum.id)}`,
            ),
          );
          assert.equal(listing.total, 0);
          // Removing album membership must preserve both the library record and public image.
          update = await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "PATCH",
              json: { albumId: null },
            }),
          );
          assert.equal(update.image.albumId, null);
          assert.equal(update.image.url, image.url);
          const remaining = await jsonBody(
            await authenticated(
              `/api/images?albumId=${encodeURIComponent(secondAlbum.id)}`,
            ),
          );
          assert.equal(remaining.total, 0);
          const preserved = await jsonBody(
            await authenticated(`/api/images?q=${encodeURIComponent(marker)}`),
          );
          assert.ok(preserved.images.some((item) => item.id === image.id));
          const original = await fetch(image.url);
          assert.equal(original.status, 200);
          assert.ok((await original.arrayBuffer()).byteLength > 0);
          await authenticated(`/api/images/${image.id}`, {
            method: "PATCH",
            json: { albumId: secondAlbum.id },
          });

          const renamed = await jsonBody(
            await authenticated(`/api/albums/${secondAlbum.id}`, {
              method: "PATCH",
              json: {
                name: `${marker}-renamed`,
                description: "Updated integration album",
              },
            }),
          );
          assert.equal(renamed.album.name, `${marker}-renamed`);
          assert.equal(renamed.album.description, "Updated integration album");

          assert.deepEqual(
            await jsonBody(
              await authenticated(`/api/albums/${secondAlbum.id}`, {
                method: "DELETE",
              }),
            ),
            { ok: true },
          );
          albumIds.delete(secondAlbum.id);
          listing = await jsonBody(
            await authenticated(`/api/images?q=${encodeURIComponent(marker)}`),
          );
          assert.equal(listing.total, 1);
          assert.equal(listing.images[0].id, image.id);
          assert.equal(listing.images[0].albumId, null);
          albums = (await jsonBody(await authenticated("/api/albums"))).albums;
          assert.equal(
            albums.some((album) => album.id === secondAlbum.id),
            false,
          );
        },
      );

      await t.test(
        "public originals support exact GET bytes, HEAD, and conditional ETag requests without a session",
        async () => {
          assert.ok(image);
          // Route generated public paths to local Wrangler even when PUBLIC_URL is configured.
          const path = new URL(image.url).pathname;
          const response = await request(path);
          assert.equal(response.status, 200);
          assert.match(
            response.headers.get("Content-Type") || "",
            /^image\/png(?:;|$)/i,
          );
          assert.equal(response.headers.get("Set-Cookie"), null);
          assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
          const etag = response.headers.get("ETag");
          assert.ok(etag, "Public image delivery must include an ETag.");

          const head = await request(path, { method: "HEAD" });
          assert.equal(head.status, 200);
          assert.equal(head.headers.get("ETag"), etag);
          assert.equal((await head.arrayBuffer()).byteLength, 0);
          for (const method of ["GET", "HEAD"]) {
            const conditional = await request(path, {
              method,
              headers: { "If-None-Match": etag },
            });
            assert.equal(conditional.status, 304);
            assert.equal((await conditional.arrayBuffer()).byteLength, 0);
          }
        },
      );

      await t.test(
        "download responses use attachment with UTF-8 and safe fallback filenames while ordinary image links remain inline",
        async () => {
          assert.ok(image);
          const name = `${marker}-山野 "写真" (1).png`;
          image = (
            await jsonBody(
              await authenticated(`/api/images/${image.id}`, {
                method: "PATCH",
                json: { name },
              }),
            )
          ).image;
          const path = new URL(image.url).pathname;

          for (const method of ["GET", "HEAD"]) {
            const response = await request(`${path}?download=1`, { method });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("Set-Cookie"), null);
            const disposition =
              response.headers.get("Content-Disposition") || "";
            assert.match(disposition, /^attachment(?:;|$)/i);
            const extended = disposition.match(
              /(?:^|;\s*)filename\*=UTF-8''([^;]+)/i,
            );
            assert.ok(
              extended,
              "Downloads must preserve non-ASCII filenames with filename*.",
            );
            assert.equal(decodeURIComponent(extended[1]), name);
            const fallback = disposition.match(
              /(?:^|;\s*)filename="([^"\\\r\n]+)"(?:;|$)/i,
            );
            assert.ok(
              fallback,
              "Downloads need a quoted fallback filename without unsafe characters.",
            );
            assert.match(fallback[1], /^[\x20-\x7e]+\.png$/i);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (method === "GET") assert.deepEqual(bytes, png);
            else assert.equal(bytes.length, 0);
          }
          for (const suffix of ["", "?download=0"]) {
            const response = await request(`${path}${suffix}`, {
              method: "HEAD",
            });
            assert.equal(response.status, 200);
            assert.match(
              response.headers.get("Content-Disposition") || "",
              /^inline(?:;|$)/i,
            );
          }
        },
      );

      await t.test(
        "upload tokens are independent, upload-only, one-time and revocable",
        async () => {
          const created = await jsonBody(
            await authenticated("/api/tokens", {
              method: "POST",
              json: { name: marker },
            }),
            201,
          );
          try {
            assert.match(created.token, /^ib_[a-f0-9]{64}$/);
            const listed = await jsonBody(await authenticated("/api/tokens"));
            assert.ok(
              listed.tokens.some((token) => token.id === created.record.id),
            );
            assert.ok(!JSON.stringify(listed).includes(created.token));
            const headers = { Authorization: `Bearer ${created.token}` };
            assert.equal(
              (
                await request("/api/v1/images", {
                  method: "POST",
                  body: uploadForm(marker + ".png"),
                })
              ).status,
              401,
            );
            assert.equal(
              (
                await authenticated("/api/v1/images", {
                  method: "POST",
                  body: uploadForm(marker + ".png"),
                })
              ).status,
              401,
            );
            assert.equal(
              (await request("/api/tokens", { headers })).status,
              401,
            );
            assert.equal(
              (await request("/api/images", { headers })).status,
              401,
            );
            const uploaded = await jsonBody(
              await request("/api/v1/images", {
                method: "POST",
                headers,
                body: uploadForm(marker + "-token.png"),
              }),
              201,
            );
            imageIds.add(uploaded.image.id);
            assert.equal(uploaded.image.width, 1);
            assert.equal(uploaded.image.height, 1);
            assert.equal(uploaded.image.size, png.length);
            assert.ok(uploaded.image.originalUrl);
          } finally {
            await authenticated(`/api/tokens/${created.record.id}`, {
              method: "DELETE",
            });
          }
          assert.equal(
            (
              await request("/api/v1/images", {
                method: "POST",
                headers: { Authorization: `Bearer ${created.token}` },
                body: uploadForm(marker + ".png"),
              })
            ).status,
            401,
          );
        },
      );
      await t.test(
        "URL upload rejects unsafe addresses and malformed input",
        async () => {
          for (const url of [
            "file:///etc/passwd",
            "http://127.0.0.1/a.png",
            "http://169.254.169.254/",
            "http://[::1]/",
            "https://user:secret@example.com/a.png",
            "http://localhost/image",
            "https://example.com:8080/a",
          ]) {
            assert.equal(
              (
                await authenticated("/api/upload-url", {
                  method: "POST",
                  json: { url },
                })
              ).status,
              400,
            );
          }
        },
      );
      await t.test(
        "favorites and album metadata survive recycling and restoration",
        async () => {
          const album = (
            await jsonBody(
              await authenticated("/api/albums", {
                method: "POST",
                json: { name: marker + "-restore" },
              }),
              201,
            )
          ).album;
          albumIds.add(album.id);
          image = (
            await jsonBody(
              await authenticated(`/api/images/${image.id}`, {
                method: "PATCH",
                json: { favorite: true, albumId: album.id },
              }),
            )
          ).image;
          await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "DELETE",
            }),
          );
          const empty = await jsonBody(
            await authenticated(`/api/images?albumId=${album.id}`),
          );
          assert.equal(empty.total, 0);
          await jsonBody(
            await authenticated(`/api/trash/${image.id}`, { method: "POST" }),
          );
          const recovered = await jsonBody(
            await authenticated(`/api/images?albumId=${album.id}`),
          );
          assert.equal(recovered.images[0].favorite, true);
          assert.equal(recovered.images[0].albumId, album.id);
        },
      );

      await t.test(
        "recycle, restore and purge preserve metadata until permanent deletion",
        async () => {
          assert.ok(image);
          assert.deepEqual(
            await jsonBody(
              await authenticated(`/api/images/${image.id}`, {
                method: "DELETE",
              }),
            ),
            { ok: true },
          );
          const result = await jsonBody(
            await authenticated(`/api/images?q=${encodeURIComponent(marker)}`),
          );
          assert.ok(!result.images.some((item) => item.id === image.id));
          const path = new URL(image.url).pathname;
          assert.equal((await request(path)).status, 200);
          const recycled = await jsonBody(await authenticated("/api/trash"));
          assert.ok(recycled.images.some((item) => item.id === image.id));
          await jsonBody(
            await authenticated(`/api/trash/${image.id}`, { method: "POST" }),
          );
          const restored = await jsonBody(
            await authenticated(`/api/images?q=${encodeURIComponent(marker)}`),
          );
          assert.equal(
            restored.images.find((item) => item.id === image.id).name,
            image.name,
          );
          assert.deepEqual(
            restored.images.find((item) => item.id === image.id).tags,
            image.tags,
          );
          await jsonBody(
            await authenticated(`/api/images/${image.id}`, {
              method: "DELETE",
            }),
          );
          await jsonBody(
            await authenticated(`/api/trash/${image.id}`, { method: "DELETE" }),
          );
          imageIds.delete(image.id);
          assert.equal((await request(path)).status, 404);
          assert.equal((await request(path, { method: "HEAD" })).status, 404);
        },
      );
    } finally {
      if (cookie) {
        // Keep cleanup independent so one failure does not strand other fixtures.
        const cleanup = await Promise.allSettled([
          ...[...imageIds].map((id) =>
            (async () => {
              await authenticated(`/api/images/${id}`, { method: "DELETE" });
              return authenticated(`/api/trash/${id}`, { method: "DELETE" });
            })(),
          ),
          ...[...albumIds].map((id) =>
            authenticated(`/api/albums/${id}`, { method: "DELETE" }),
          ),
        ]);
        for (const result of cleanup) {
          if (
            result.status === "rejected" ||
            ![200, 404].includes(result.value.status)
          ) {
            t.diagnostic(
              `Fixture cleanup needs attention for prefix ${marker}.`,
            );
          }
        }

        await t.test(
          "logout clears the cookie and revokes the saved session on the server",
          async () => {
            const response = await authenticated("/api/logout", {
              method: "POST",
            });
            assert.deepEqual(await jsonBody(response), { ok: true });
            assert.match(
              response.headers.get("Set-Cookie") || "",
              /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i,
            );
            // Send the *old* value explicitly: deleting a browser cookie alone is insufficient.
            assert.deepEqual(
              await jsonBody(await authenticated("/api/session")),
              { authenticated: false, configured: true },
            );
            assert.equal((await authenticated("/api/images")).status, 401);
            assert.equal((await request("/api/images")).status, 401);
          },
        );
      }
    }
  },
);
