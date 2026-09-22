import {
  boundedBody,
  fields,
  HttpError,
  json,
  readJson,
  type Env,
} from "./shared";

const COOKIE_NAME = "image_bed_session";
const SESSION_TTL = 7 * 24 * 60 * 60;
const LOGIN_WINDOW = 15 * 60;
const LOGIN_LIMIT = 10;
const encoder = new TextEncoder();

export function configured(env: Env, request?: Request): boolean {
  const localShortPassword =
    env.LOCAL_DEV_ALLOW_SHORT_PASSWORD === "1" &&
    request !== undefined &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
  return (
    typeof env.ADMIN_PASSWORD === "string" &&
    env.ADMIN_PASSWORD.length >= (localShortPassword ? 6 : 12) &&
    env.ADMIN_PASSWORD.length <= 1024 &&
    typeof env.SESSION_SECRET === "string" &&
    env.SESSION_SECRET.length >= 32
  );
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(
    atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    ),
    (char) => char.charCodeAt(0),
  );
}

async function key(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string, env: Env): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await key(env), encoder.encode(value)),
    ),
  );
}

async function hash(value: string): Promise<string> {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}

function cookie(request: Request, value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export async function currentSession(
  request: Request,
  env: Env,
): Promise<string | null> {
  if (!configured(env, request)) return null;
  const value = request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!value || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(value))
    return null;
  const [token, signature] = value.split(".") as [string, string];
  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      "HMAC",
      await key(env),
      decode(signature),
      encoder.encode(`session:${token}`),
    );
  } catch {
    return null;
  }
  if (!verified) return null;
  const tokenHash = await hash(token);
  const session = await env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?",
  )
    .bind(tokenHash, Math.floor(Date.now() / 1000))
    .first();
  return session ? tokenHash : null;
}

export async function requireSession(
  request: Request,
  env: Env,
): Promise<string> {
  if (!configured(env, request))
    throw new HttpError(
      503,
      "请先配置 ADMIN_PASSWORD（至少 12 字符）和 SESSION_SECRET（至少 32 字符）",
    );
  const session = await currentSession(request, env);
  if (!session) throw new HttpError(401, "请先登录");
  return session;
}

async function rateLimit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // CF-Connecting-IP is set by Cloudflare. Never trust client-supplied X-Forwarded-For.
  // Local Wrangler has no edge IP header, so local callers intentionally share a bucket.
  const scope = await sign(
    `login-ip:${request.headers.get("CF-Connecting-IP") || "local"}`,
    env,
  );
  const row = await env.DB.prepare(
    `
    INSERT INTO login_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts, expires_at
  `,
  )
    .bind(scope, now + LOGIN_WINDOW, now, now)
    .first<{ attempts: number; expires_at: number }>();
  ctx.waitUntil(
    env.DB.batch([
      env.DB.prepare("DELETE FROM login_attempts WHERE expires_at <= ?").bind(
        now,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    ])
      .then(() => undefined)
      .catch((error) => console.error("Auth cleanup failed", error)),
  );
  if (!row || row.attempts > LOGIN_LIMIT) {
    throw new HttpError(429, "登录尝试过于频繁，请稍后再试", {
      "Retry-After": String(
        Math.max(1, (row?.expires_at ?? now + LOGIN_WINDOW) - now),
      ),
    });
  }
}

export async function login(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!configured(env, request))
    throw new HttpError(
      503,
      "请先配置 ADMIN_PASSWORD（至少 12 字符）和 SESSION_SECRET（至少 32 字符）",
    );
  await rateLimit(request, env, ctx);
  const body = await readJson(request);
  fields(body, ["password"]);
  if (typeof body.password !== "string" || body.password.length > 1024)
    throw new HttpError(400, "密码格式无效");
  // WebCrypto verifies a fixed-length HMAC without comparing password strings.
  const expected = await sign(`password:${env.ADMIN_PASSWORD!}`, env);
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await key(env),
      decode(expected),
      encoder.encode(`password:${body.password}`),
    ))
  ) {
    throw new HttpError(401, "密码不正确");
  }
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  const previous = await currentSession(request, env);
  const statements = [
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)",
    ).bind(await hash(token), now + SESSION_TTL, now),
  ];
  if (previous)
    statements.push(
      env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(
        previous,
      ),
    );
  await env.DB.batch(statements);
  return json({ ok: true }, 200, {
    "Set-Cookie": cookie(
      request,
      `${token}.${await sign(`session:${token}`, env)}`,
      SESSION_TTL,
    ),
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  // Bound even this otherwise-unused body to avoid accepting unbounded uploads.
  if (request.body) await boundedBody(request, 1024);
  const session = await currentSession(request, env);
  if (session)
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(session)
      .run();
  return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
}
