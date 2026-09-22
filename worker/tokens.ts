import {
  type Env,
  HttpError,
  json,
  readJson,
  fields,
  textField,
} from "./shared";
async function digest(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function requireToken(request: Request, env: Env) {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (ib_[a-f0-9]{64})$/)?.[1];
  if (
    !token ||
    !(await env.DB.prepare("SELECT id FROM api_tokens WHERE token_hash = ?")
      .bind(await digest(token))
      .first())
  )
    throw new HttpError(401, "Invalid or revoked upload token");
}
export async function tokens(request: Request, env: Env) {
  if (request.method === "GET")
    return json({
      tokens: (
        await env.DB.prepare(
          "SELECT id,name,created_at AS createdAt FROM api_tokens ORDER BY created_at DESC",
        ).all()
      ).results,
    });
  const body = await readJson(request);
  fields(body, ["name"]);
  const name = textField(body.name, "Token name", 80);
  const id = crypto.randomUUID(),
    createdAt = new Date().toISOString();
  const token =
    "ib_" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  const result = await env.DB.prepare(
    "INSERT INTO api_tokens (id,name,token_hash,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM api_tokens) < 50",
  )
    .bind(id, name, await digest(token), createdAt)
    .run();
  if (!result.meta.changes) throw new HttpError(400, "Maximum 50 tokens");
  return json({ token, record: { id, name, createdAt } }, 201);
}
export async function revokeToken(env: Env, id: string) {
  await env.DB.prepare("DELETE FROM api_tokens WHERE id=?").bind(id).run();
  return json({ ok: true });
}
