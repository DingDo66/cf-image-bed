export interface Env {
  DB: D1Database;
  IMAGE_PROCESSOR?: ImagesBinding;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  LOCAL_DEV_ALLOW_SHORT_PASSWORD?: string;
  SESSION_SECRET?: string;
  PUBLIC_URL?: string;
}

export interface ImageRow {
  id: string;
  name: string;
  size: number;
  mime: string;
  original_key: string;
  thumbnail_key: string | null;
  width: number | null;
  height: number | null;
  description: string;
  tags: string;
  album_id: string | null;
  created_at: string;
  deleted_at: string | null;
  preview_key?: string | null;
  favorite?: number;
  purge_started_at?: string | null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers?: HeadersInit,
  ) {
    super(message);
  }
}

export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const result = new Headers(headers);
  result.set("Content-Type", "application/json; charset=utf-8");
  result.set("Cache-Control", "no-store");
  result.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: result });
}

export function assertMethod(request: Request, allowed: string[]): void {
  if (!allowed.includes(request.method)) {
    throw new HttpError(405, "不支持此请求方法", { Allow: allowed.join(", ") });
  }
}

export function validateOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (
    (origin !== null && origin !== new URL(request.url).origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  ) {
    throw new HttpError(403, "请求来源无效，请从图床页面重试");
  }
}

/** Enforce the actual streamed size, including requests without Content-Length. */
export async function boundedBody(
  request: Request,
  maxBytes: number,
): Promise<Blob> {
  const contentLength = request.headers.get("Content-Length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    throw new HttpError(413, "请求内容过大");
  }
  if (!request.body) throw new HttpError(400, "请求内容不能为空");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "请求内容过大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new HttpError(415, "请使用 application/json 请求格式");
  }
  const body = await boundedBody(request, 16 * 1024);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await body.text());
  } catch {
    throw new HttpError(400, "JSON 格式无效");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "请求内容必须是对象");
  }
  return parsed as Record<string, unknown>;
}

export function fields(body: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new HttpError(400, "包含未知字段");
}

export function textField(
  value: unknown,
  label: string,
  max: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string") throw new HttpError(400, `${label}必须是文本`);
  const result = value.trim();
  if (
    (!allowEmpty && !result) ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)
  ) {
    throw new HttpError(400, `${label}长度或格式无效（最多 ${max} 字符）`);
  }
  return result;
}

export function imageName(value: unknown): string {
  const name = textField(value, "文件名", 255);
  if (/[\\/\r\n\t]/.test(name) || name === "." || name === "..")
    throw new HttpError(400, "文件名不能包含路径或控制字符");
  return name;
}

export function validId(value: unknown, label = "ID"): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value,
    )
  ) {
    throw new HttpError(400, `${label}格式无效`);
  }
  return value;
}

export function publicOrigin(request: Request, env: Env): string {
  if (!env.PUBLIC_URL?.trim()) return new URL(request.url).origin;
  try {
    const value = new URL(env.PUBLIC_URL.trim());
    if (
      !["http:", "https:"].includes(value.protocol) ||
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      value.pathname !== "/"
    ) {
      throw new Error("Invalid public origin");
    }
    if (
      value.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(value.hostname)
    )
      throw new Error("HTTPS required");
    return value.origin;
  } catch {
    throw new HttpError(
      503,
      "PUBLIC_URL 配置无效，请设置为 HTTPS 域名且不包含路径",
    );
  }
}

export function imageRecord(row: ImageRow, origin: string) {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mime: row.mime,
    width: row.width,
    height: row.height,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    albumId: row.album_id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    favorite: !!row.favorite,
    purgeStarted: !!row.purge_started_at,
    originalUrl: `${origin}/i/${row.original_key}`,
    url: row.preview_key
      ? `${origin}/p/${row.preview_key}`
      : `${origin}/i/${row.original_key}`,
    thumbnailUrl: row.thumbnail_key
      ? `${origin}/t/${row.thumbnail_key}`
      : row.preview_key
        ? `${origin}/p/${row.preview_key}`
        : `${origin}/i/${row.original_key}`,
  };
}

export async function albumExists(
  env: Env,
  id: unknown,
): Promise<string | null> {
  if (id === null) return null;
  const albumId = validId(id, "相册 ID");
  if (
    !(await env.DB.prepare("SELECT id FROM albums WHERE id = ?")
      .bind(albumId)
      .first())
  )
    throw new HttpError(404, "相册不存在");
  return albumId;
}

export function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (headers.get("Content-Type")?.includes("text/html")) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
