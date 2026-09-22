import {
  type Env,
  type ImageRow,
  HttpError,
  json,
  imageRecord,
  publicOrigin,
} from "./shared";
const RETENTION = 30 * 86400000;
export async function trashList(request: Request, env: Env) {
  const raw = new URL(request.url).searchParams.get("offset") || "0";
  if (!/^\d{1,7}$/.test(raw)) throw new HttpError(400, "Invalid offset");
  const rows = await env.DB.prepare(
    "SELECT * FROM images WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC,id DESC LIMIT 100 OFFSET ?",
  )
    .bind(Number(raw))
    .all<ImageRow>();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM images WHERE deleted_at IS NOT NULL",
  ).first<{ total: number }>();
  return json({
    images: rows.results.map((r) => imageRecord(r, publicOrigin(request, env))),
    total: count?.total || 0,
  });
}
export async function restoreImage(env: Env, id: string) {
  const row = await env.DB.prepare(
    "UPDATE images SET deleted_at=NULL WHERE id=? AND deleted_at > ? AND purge_started_at IS NULL RETURNING id",
  )
    .bind(id, new Date(Date.now() - RETENTION).toISOString())
    .first();
  if (!row)
    throw new HttpError(
      409,
      "Image expired, already restored, or being permanently deleted",
    );
  return json({ ok: true });
}
export async function purgeImage(env: Env, id: string) {
  // The claim prevents restore racing with deletion of R2 objects. Failed purges are retryable.
  const row = await env.DB.prepare(
    "UPDATE images SET purge_started_at=COALESCE(purge_started_at,?) WHERE id=? AND deleted_at IS NOT NULL RETURNING *",
  )
    .bind(new Date().toISOString(), id)
    .first<ImageRow>();
  if (!row)
    throw new HttpError(409, "Only recycled images can be permanently deleted");
  await env.IMAGES.delete([
    `originals/${row.original_key}`,
    ...(row.thumbnail_key ? [`thumbnails/${row.thumbnail_key}`] : []),
    ...(row.preview_key ? [`previews/${row.preview_key}`] : []),
  ]);
  await env.DB.prepare(
    "DELETE FROM images WHERE id=? AND purge_started_at IS NOT NULL",
  )
    .bind(id)
    .run();
  return json({ ok: true });
}
export async function purgeBatch(env: Env, expiredOnly: boolean) {
  const cutoff = new Date(Date.now() - RETENTION).toISOString();
  const rows = await env.DB.prepare(
    `SELECT id FROM images WHERE deleted_at IS NOT NULL ${expiredOnly ? "AND (deleted_at <= ? OR purge_started_at IS NOT NULL)" : ""} ORDER BY deleted_at LIMIT 100`,
  )
    .bind(...(expiredOnly ? [cutoff] : []))
    .all<{ id: string }>();
  let removed = 0;
  for (const row of rows.results) {
    try {
      await purgeImage(env, row.id);
      removed++;
    } catch (error) {
      console.error("Trash purge failed", row.id, error);
    }
  }
  return json({
    removed,
    failed: rows.results.length - removed,
    hasMore: rows.results.length === 100,
  });
}
