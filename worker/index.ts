import { requireToken, tokens, revokeToken } from "./tokens";
import { trashList, restoreImage, purgeImage, purgeBatch } from "./trash";
import { uploadURL } from "./url-upload";
import {
  configured,
  currentSession,
  login,
  logout,
  requireSession,
} from "./auth";
import {
  createAlbum,
  deleteAlbum,
  listAlbums,
  patchAlbum,
  stats,
} from "./albums";
import {
  deleteImage,
  listImages,
  patchImage,
  serveImage,
  uploadImage,
} from "./images";
import {
  assertMethod,
  HttpError,
  json,
  securityHeaders,
  validId,
  validateOrigin,
  type Env,
} from "./shared";

export type { Env } from "./shared";

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    url.protocol = "https:";
    return new Response(null, {
      status: 308,
      headers: { Location: url.toString() },
    });
  }
  const path = url.pathname;
  const media = path.match(/^\/(i|t|p)\/([^/]+)$/);
  if (media)
    return serveImage(request, env, media[1] as "i" | "t" | "p", media[2]!);
  if (
    path.startsWith("/i/") ||
    path.startsWith("/t/") ||
    path.startsWith("/p/")
  )
    throw new HttpError(404, "图片不存在");
  if (!path.startsWith("/api/")) {
    assertMethod(request, ["GET", "HEAD"]);
    return securityHeaders(await env.ASSETS.fetch(request));
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
    validateOrigin(request);
  if (path === "/api/session") {
    assertMethod(request, ["GET"]);
    return json({
      configured: configured(env, request),
      authenticated: !!(await currentSession(request, env)),
    });
  }
  if (path === "/api/login") {
    assertMethod(request, ["POST"]);
    return login(request, env, ctx);
  }
  if (path === "/api/logout") {
    assertMethod(request, ["POST"]);
    return logout(request, env);
  }
  if (path === "/api/v1/images") {
    assertMethod(request, ["POST"]);
    await requireToken(request, env);
    return uploadImage(request, env);
  }
  await requireSession(request, env);
  if (path === "/api/upload-url") {
    assertMethod(request, ["POST"]);
    return uploadURL(request, env);
  }
  if (path === "/api/tokens") {
    assertMethod(request, ["GET", "POST"]);
    return tokens(request, env);
  }
  const token = path.match(/^\/api\/tokens\/([^/]+)$/);
  if (token) {
    assertMethod(request, ["DELETE"]);
    return revokeToken(env, validId(token[1]));
  }
  if (path === "/api/trash") {
    assertMethod(request, ["GET", "DELETE"]);
    return request.method === "GET"
      ? trashList(request, env)
      : purgeBatch(env, false);
  }
  const trash = path.match(/^\/api\/trash\/([^/]+)$/);
  if (trash) {
    assertMethod(request, ["POST", "DELETE"]);
    const id = validId(trash[1]);
    return request.method === "POST"
      ? restoreImage(env, id)
      : purgeImage(env, id);
  }

  if (path === "/api/images") {
    assertMethod(request, ["GET", "POST"]);
    return request.method === "GET"
      ? listImages(request, env)
      : uploadImage(request, env);
  }
  const image = path.match(/^\/api\/images\/([^/]+)$/);
  if (image) {
    assertMethod(request, ["PATCH", "DELETE"]);
    const id = validId(image[1]);
    return request.method === "PATCH"
      ? patchImage(request, env, id)
      : deleteImage(env, id);
  }
  if (path === "/api/albums") {
    assertMethod(request, ["GET", "POST"]);
    return request.method === "GET"
      ? listAlbums(request, env)
      : createAlbum(request, env);
  }
  const album = path.match(/^\/api\/albums\/([^/]+)$/);
  if (album) {
    assertMethod(request, ["PATCH", "DELETE"]);
    const id = validId(album[1]);
    return request.method === "PATCH"
      ? patchAlbum(request, env, id)
      : deleteAlbum(env, id);
  }
  if (path === "/api/stats") {
    assertMethod(request, ["GET"]);
    return stats(env);
  }
  throw new HttpError(404, "接口不存在");
}

export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(purgeBatch(env, true));
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const response = await route(request, env, ctx);
      // HEAD error/success responses must not contain a body, even on unsupported API routes.
      return request.method === "HEAD"
        ? new Response(null, {
            status: response.status,
            headers: response.headers,
          })
        : response;
    } catch (error) {
      const response =
        error instanceof HttpError
          ? json({ error: error.message }, error.status, error.headers)
          : json({ error: "服务暂时不可用，请稍后重试" }, 500);
      if (!(error instanceof HttpError))
        console.error("Unhandled Worker request error", error);
      return request.method === "HEAD"
        ? new Response(null, {
            status: response.status,
            headers: response.headers,
          })
        : response;
    }
  },
} satisfies ExportedHandler<Env>;
