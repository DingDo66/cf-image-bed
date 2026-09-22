import { dimensions } from "./dimensions";
import {
  albumExists,
  assertMethod,
  boundedBody,
  fields,
  HttpError,
  imageName,
  imageRecord,
  json,
  publicOrigin,
  readJson,
  textField,
  validId,
  type Env,
  type ImageRow,
} from "./shared";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 512 * 1024;
const MAX_MULTIPART_BYTES =
  MAX_IMAGE_BYTES + MAX_THUMBNAIL_BYTES + 10 * 1024 * 1024 + 64 * 1024;

type ImageFormat = { mime: string; extension: string };

function starts(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** The authoritative MIME comes from file bytes, never a filename or browser header. */
export function sniffImage(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length >= 4 &&
    starts(bytes, [0xff, 0xd8, 0xff]) &&
    bytes[3] !== 0x00 &&
    bytes[3] !== 0xff
  )
    return { mime: "image/jpeg", extension: "jpg" };
  if (
    bytes.length >= 24 &&
    starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    starts(bytes, [0x49, 0x48, 0x44, 0x52], 12)
  )
    return { mime: "image/png", extension: "png" };
  if (
    bytes.length >= 10 &&
    (starts(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      starts(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
  )
    return { mime: "image/gif", extension: "gif" };
  if (
    bytes.length >= 16 &&
    starts(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    starts(bytes, [0x57, 0x45, 0x42, 0x50], 8) &&
    (starts(bytes, [0x56, 0x50, 0x38, 0x20], 12) ||
      starts(bytes, [0x56, 0x50, 0x38, 0x4c], 12) ||
      starts(bytes, [0x56, 0x50, 0x38, 0x58], 12))
  )
    return { mime: "image/webp", extension: "webp" };
  if (
    bytes.length >= 16 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
  ) {
    const brands = String.fromCharCode(...bytes.slice(8));
    if (/heic|heix|hevc|hevx/.test(brands))
      return { mime: "image/heic", extension: "heic" };
    if (/mif1|msf1/.test(brands))
      return { mime: "image/heif", extension: "heif" };
  }
  return null;
}

function integerParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === null) return fallback;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new HttpError(400, `${name}参数无效`);
  return Number(value);
}

function dimension(value: string | File | null): number | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "图片尺寸格式无效");
  return integerParam(value, 0, 1, 100_000, "图片尺寸");
}

async function fileFormat(file: File, max: number): Promise<ImageFormat> {
  if (file.size === 0 || file.size > max)
    throw new HttpError(
      413,
      max === MAX_IMAGE_BYTES
        ? "单张图片须大于 0 字节且不超过 20 MB"
        : max === MAX_THUMBNAIL_BYTES
          ? "缩略图须大于 0 字节且不超过 512 KB"
          : "HEIC preview must be between 1 byte and 10 MB",
    );
  const format = sniffImage(
    new Uint8Array(await file.slice(0, 32).arrayBuffer()),
  );
  if (!format)
    throw new HttpError(
      415,
      "仅支持真实的 JPEG、PNG、WebP、GIF、HEIC 和 HEIF 图片",
    );
  const declared = file.type.toLowerCase();
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== format.mime &&
    !(declared === "image/jpg" && format.mime === "image/jpeg") &&
    !(declared.startsWith("image/hei") && format.mime.startsWith("image/hei"))
  )
    throw new HttpError(415, "图片声明格式与实际文件内容不一致");
  return format;
}

export async function listImages(
  request: Request,
  env: Env,
): Promise<Response> {
  const search = new URL(request.url).searchParams;
  const limit = integerParam(search.get("limit"), 48, 1, 100, "limit");
  const offset = integerParam(search.get("offset"), 0, 0, 1_000_000, "offset");
  const clauses = ["deleted_at IS NULL"];
  const values: (string | number)[] = [];
  const query = search.get("q");
  if (query !== null) {
    const q = textField(query, "搜索关键词", 200, true);
    if (q) {
      // D1 caps LIKE/GLOB patterns at 50 bytes. instr handles long Unicode search
      // terms and treats %, _, and backslashes literally without pattern escaping.
      clauses.push(
        "(instr(lower(name), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0 OR EXISTS (SELECT 1 FROM json_each(images.tags) WHERE instr(lower(json_each.value), lower(?)) > 0))",
      );
      values.push(q, q, q);
    }
  }
  const albumId = search.get("albumId");
  if (albumId !== null && albumId !== "") {
    clauses.push("album_id = ?");
    values.push(validId(albumId, "相册 ID"));
  }
  const recent = search.get("recent");
  if (recent !== null && recent !== "0" && recent !== "1")
    throw new HttpError(400, "recent 参数无效");
  if (recent === "1") {
    clauses.push("created_at >= ?");
    values.push(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  }
  const where = clauses.join(" AND ");
  const [count, rows] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM images WHERE ${where}`).bind(
      ...values,
    ),
    env.DB.prepare(
      `SELECT * FROM images WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).bind(...values, limit, offset),
  ]);
  const origin = publicOrigin(request, env);
  return json({
    images: (rows.results as unknown as ImageRow[]).map((row) =>
      imageRecord(row, origin),
    ),
    total: Number(
      (count.results[0] as { total: number } | undefined)?.total ?? 0,
    ),
  });
}

export async function uploadImage(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = publicOrigin(request, env);
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType))
    throw new HttpError(415, "请使用 multipart/form-data 上传图片");
  const blob = await boundedBody(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Response(blob, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new HttpError(400, "上传表单格式无效");
  }
  const allowed = [
    "file",
    "thumbnail",
    "width",
    "height",
    "albumId",
    "preview",
  ];
  for (const name of form.keys()) {
    if (!allowed.includes(name) || form.getAll(name).length !== 1)
      throw new HttpError(400, "上传字段无效或重复，每次仅支持一张原图");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "请选择图片文件");
  const name = imageName(file.name);
  const format = await fileFormat(file, MAX_IMAGE_BYTES);
  let thumbnail = form.get("thumbnail");
  if (thumbnail !== null && !(thumbnail instanceof File))
    throw new HttpError(400, "缩略图格式无效");
  if (
    thumbnail instanceof File &&
    (await fileFormat(thumbnail, MAX_THUMBNAIL_BYTES)).mime !== "image/webp"
  )
    throw new HttpError(415, "缩略图必须是 WebP 图片");
  const heic = format.mime.startsWith("image/hei");
  let preview = form.get("preview");
  if (preview !== null && (!(preview instanceof File) || !heic))
    throw new HttpError(400, "Preview is only accepted for HEIC/HEIF");
  let metadata = heic
    ? null
    : dimensions(new Uint8Array(await file.arrayBuffer()), format.mime);
  if (!heic && !metadata)
    throw new HttpError(415, "Invalid image dimensions or corrupt image");
  if (heic && !preview) {
    if (!env.IMAGE_PROCESSOR)
      throw new HttpError(
        503,
        "HEIC conversion requires the IMAGE_PROCESSOR binding",
      );
    try {
      const info = await env.IMAGE_PROCESSOR.info(file.stream());
      if ("width" in info)
        metadata = { width: info.width, height: info.height };
      const result = await env.IMAGE_PROCESSOR.input(file.stream())
        .transform({ width: 2560, height: 2560, fit: "scale-down" })
        .output({ format: "image/jpeg", quality: 88 });
      preview = new File(
        [await result.response().arrayBuffer()],
        "preview.jpg",
        { type: "image/jpeg" },
      );
    } catch (error) {
      console.error("HEIC conversion failed", error instanceof Error ? error.message : "Unknown Images binding error");
      throw new HttpError(
        415,
        "HEIC conversion failed. Check the image and Images binding.",
      );
    }
  }
  if (preview instanceof File) {
    if ((await fileFormat(preview, 10 * 1024 * 1024)).mime !== "image/jpeg")
      throw new HttpError(415, "HEIC preview must be JPEG");
    const previewSize = dimensions(
      new Uint8Array(await preview.arrayBuffer()),
      "image/jpeg",
    );
    if (!previewSize) throw new HttpError(415, "Invalid HEIC preview");
    metadata ||= {
      width: dimension(form.get("width")) || previewSize.width,
      height: dimension(form.get("height")) || previewSize.height,
    };
  }
  const width = metadata?.width || null;
  const height = metadata?.height || null;
  const albumValue = form.get("albumId");
  const albumId =
    albumValue === null || albumValue === ""
      ? null
      : await albumExists(env, albumValue);
  const id = crypto.randomUUID();
  const originalKey = `${id}.${format.extension}`;
  const thumbnailKey = thumbnail instanceof File ? `${id}.webp` : null;
  const storageKeys = [
    `originals/${originalKey}`,
    ...(thumbnailKey ? [`thumbnails/${thumbnailKey}`] : []),
  ];
  const previewKey = preview instanceof File ? `${id}.jpg` : null;
  if (previewKey) storageKeys.push(`previews/${previewKey}`);
  const createdAt = new Date().toISOString();
  try {
    await env.IMAGES.put(storageKeys[0]!, file, {
      httpMetadata: { contentType: format.mime },
    });
    if (thumbnail instanceof File)
      await env.IMAGES.put(storageKeys[1]!, thumbnail, {
        httpMetadata: { contentType: "image/webp" },
      });
    if (preview instanceof File)
      await env.IMAGES.put(`previews/${previewKey}`, preview, {
        httpMetadata: { contentType: "image/jpeg" },
      });
    await env.DB.prepare(
      `INSERT INTO images (id, name, size, mime, original_key, thumbnail_key, width, height, album_id, created_at, preview_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        name,
        file.size,
        format.mime,
        originalKey,
        thumbnailKey,
        width,
        height,
        albumId,
        createdAt,
        previewKey,
      )
      .run();
  } catch (error) {
    // D1 and R2 have no shared transaction: compensate failed uploads, including a partial R2 write.
    try {
      await env.IMAGES.delete(storageKeys);
    } catch (cleanupError) {
      console.error("Upload rollback failed; remove unreferenced objects", {
        storageKeys,
        cleanupError,
      });
    }
    console.error("Image upload failed", error);
    throw new HttpError(503, "图片保存失败，请稍后重试");
  }
  const row: ImageRow = {
    id,
    name,
    size: file.size,
    mime: format.mime,
    original_key: originalKey,
    thumbnail_key: thumbnailKey,
    width,
    height,
    album_id: albumId,
    created_at: createdAt,
    description: "",
    tags: "[]",
    deleted_at: null,
    preview_key: previewKey,
  };
  return json({ image: imageRecord(row, origin) }, 201);
}

export async function patchImage(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const origin = publicOrigin(request, env);
  const body = await readJson(request);
  fields(body, ["name", "description", "tags", "albumId", "favorite"]);
  if (Object.keys(body).length === 0)
    throw new HttpError(400, "请提供需要修改的字段");
  const updates: string[] = [];
  const values: (string | null)[] = [];
  if ("favorite" in body) {
    if (typeof body.favorite !== "boolean")
      throw new HttpError(400, "Invalid favorite value");
    updates.push("favorite = ?");
    values.push(body.favorite ? "1" : "0");
  }
  if ("name" in body) {
    updates.push("name = ?");
    values.push(imageName(body.name));
  }
  if ("description" in body) {
    updates.push("description = ?");
    values.push(textField(body.description, "描述", 2000, true));
  }
  if ("tags" in body) {
    if (!Array.isArray(body.tags) || body.tags.length > 20)
      throw new HttpError(400, "标签必须是数组，最多 20 个");
    const tags = [
      ...new Set(body.tags.map((tag) => textField(tag, "标签", 80))),
    ];
    updates.push("tags = ?");
    values.push(JSON.stringify(tags));
  }
  if ("albumId" in body) {
    updates.push("album_id = ?");
    values.push(await albumExists(env, body.albumId));
  }
  const row = await env.DB.prepare(
    `UPDATE images SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL RETURNING *`,
  )
    .bind(...values, id)
    .first<ImageRow>();
  if (!row) throw new HttpError(404, "图片不存在");
  return json({ image: imageRecord(row, origin) });
}

export async function deleteImage(env: Env, id: string): Promise<Response> {
  const changed = await env.DB.prepare(
    "UPDATE images SET deleted_at=? WHERE id=? AND deleted_at IS NULL",
  )
    .bind(new Date().toISOString(), id)
    .run();
  if (!changed.meta.changes) throw new HttpError(404, "Image not found");
  return json({ ok: true });
}

export async function serveImage(
  request: Request,
  env: Env,
  kind: "i" | "t" | "p",
  key: string,
): Promise<Response> {
  assertMethod(request, ["GET", "HEAD"]);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:jpg|png|webp|gif|heic|heif)$/.test(
      key,
    )
  )
    throw new HttpError(404, "图片不存在");
  const column =
    kind === "i"
      ? "original_key"
      : kind === "p"
        ? "preview_key"
        : "thumbnail_key";
  const row = await env.DB.prepare(
    `SELECT name, mime FROM images WHERE ${column} = ? AND purge_started_at IS NULL`,
  )
    .bind(key)
    .first<{ name: string; mime: string }>();
  if (!row) throw new HttpError(404, "图片不存在");
  const storageKey = `${kind === "i" ? "originals" : kind === "p" ? "previews" : "thumbnails"}/${key}`;
  const object =
    request.method === "HEAD"
      ? await env.IMAGES.head(storageKey)
      : await env.IMAGES.get(storageKey);
  if (!object) throw new HttpError(404, "图片不存在");
  const filename = encodeURIComponent(row.name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const fallbackFilename = row.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const download = new URL(request.url).searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type":
      kind === "t" ? "image/webp" : kind === "p" ? "image/jpeg" : row.mime,
    "Content-Length": String(object.size),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fallbackFilename}"; filename*=UTF-8''${filename}`,
    "Cache-Control": download
      ? "private, no-store"
      : "public, max-age=0, must-revalidate",
    ETag: object.httpEtag,
    "Last-Modified": object.uploaded.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  const etags = request.headers.get("If-None-Match");
  if (
    etags
      ?.split(",")
      .some(
        (tag) =>
          tag.trim() === "*" ||
          tag.trim().replace(/^W\//, "") === object.httpEtag,
      )
  ) {
    if ("body" in object) await (object as R2ObjectBody).body.cancel();
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  return new Response("body" in object ? (object as R2ObjectBody).body : null, {
    headers,
  });
}
