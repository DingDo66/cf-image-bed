import {
  fields,
  HttpError,
  json,
  publicOrigin,
  readJson,
  textField,
  type Env,
} from "./shared";

interface AlbumRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  image_count: number;
  cover_original_key: string | null;
  cover_thumbnail_key: string | null;
  cover_preview_key?: string | null;
}

const ALBUM_SELECT = `SELECT a.id, a.name, a.description, a.created_at,
  (SELECT COUNT(*) FROM images i WHERE i.album_id = a.id AND i.deleted_at IS NULL) AS image_count,
  (SELECT i.original_key FROM images i WHERE i.album_id = a.id AND i.deleted_at IS NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS cover_original_key,
  (SELECT i.thumbnail_key FROM images i WHERE i.album_id = a.id AND i.deleted_at IS NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS cover_thumbnail_key,
  (SELECT i.preview_key FROM images i WHERE i.album_id = a.id AND i.deleted_at IS NULL ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS cover_preview_key
  FROM albums a`;

function albumRecord(row: AlbumRow, origin: string) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    imageCount: row.image_count,
    coverUrl: row.cover_thumbnail_key
      ? `${origin}/t/${row.cover_thumbnail_key}`
      : row.cover_preview_key
        ? `${origin}/p/${row.cover_preview_key}`
        : row.cover_original_key
          ? `${origin}/i/${row.cover_original_key}`
          : null,
  };
}

export async function listAlbums(
  request: Request,
  env: Env,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${ALBUM_SELECT} ORDER BY a.created_at DESC, a.id DESC`,
  ).all<AlbumRow>();
  const origin = publicOrigin(request, env);
  return json({ albums: results.map((row) => albumRecord(row, origin)) });
}

export async function createAlbum(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = publicOrigin(request, env);
  const body = await readJson(request);
  fields(body, ["name", "description"]);
  const name = textField(body.name, "相册名称", 80);
  const description =
    "description" in body
      ? textField(body.description, "相册描述", 1000, true)
      : "";
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO albums (id, name, description, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, name, description, createdAt)
    .run();
  return json(
    {
      album: albumRecord(
        {
          id,
          name,
          description,
          created_at: createdAt,
          image_count: 0,
          cover_original_key: null,
          cover_thumbnail_key: null,
        },
        origin,
      ),
    },
    201,
  );
}

export async function patchAlbum(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const origin = publicOrigin(request, env);
  const body = await readJson(request);
  fields(body, ["name", "description"]);
  if (!Object.keys(body).length)
    throw new HttpError(400, "请提供需要修改的字段");
  const updates: string[] = [];
  const values: string[] = [];
  if ("name" in body) {
    updates.push("name = ?");
    values.push(textField(body.name, "相册名称", 80));
  }
  if ("description" in body) {
    updates.push("description = ?");
    values.push(textField(body.description, "相册描述", 1000, true));
  }
  const [changed, found] = await env.DB.batch([
    env.DB.prepare(`UPDATE albums SET ${updates.join(", ")} WHERE id = ?`).bind(
      ...values,
      id,
    ),
    env.DB.prepare(`${ALBUM_SELECT} WHERE a.id = ?`).bind(id),
  ]);
  if (!changed.meta.changes || !found.results[0])
    throw new HttpError(404, "相册不存在");
  return json({
    album: albumRecord(found.results[0] as unknown as AlbumRow, origin),
  });
}

export async function deleteAlbum(env: Env, id: string): Promise<Response> {
  // D1 enforces ON DELETE SET NULL atomically; originals and thumbnails remain intact.
  const result = await env.DB.prepare("DELETE FROM albums WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "相册不存在");
  return json({ ok: true });
}

export async function stats(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS totalImages, COALESCE(SUM(size), 0) AS totalBytes, (SELECT COUNT(*) FROM albums) AS totalAlbums FROM images WHERE deleted_at IS NULL",
  ).first<{ totalImages: number; totalBytes: number; totalAlbums: number }>();
  return json(row ?? { totalImages: 0, totalAlbums: 0, totalBytes: 0 });
}
