import { Env } from "./env";
import { json, readJson } from "./http";
import { randomCode, verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";

const CODE_TTL_SEC = 600; // 10 minutes

/** Routes the /pair* paths. */
export async function handlePairing(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/pair/create" && req.method === "POST") return pairCreate(req, env);
  if (path === "/pair/join" && req.method === "POST") return pairJoin(req, env);
  const match = path.match(/^\/pair\/([0-9a-f-]{36})$/);
  if (match && req.method === "GET") return pairGet(env, match[1]);
  if (match && req.method === "DELETE") return pairDelete(req, env, match[1]);
  return json({ error: "not_found" }, 404);
}

/** Returns the authenticated account id from the Bearer JWT, or null. */
async function authAccount(req: Request, env: Env): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}

function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 256;
}

/**
 * Child side: creates a pairing storing the child's own public key and mints a
 * short code for the parent to scan/enter. No auth — the child holds no account
 * (zero-retention). Rate-limited by IP so a device can't spam codes.
 */
async function pairCreate(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `create:${ip}`, 10, CODE_TTL_SEC))) {
    return json({ error: "rate_limited" }, 429);
  }

  const body = await readJson(req);
  if (!isPublicKey(body.childPublicKey)) return json({ error: "bad_request" }, 400);

  const id = crypto.randomUUID();
  const code = randomCode(8);
  await env.DB.prepare(
    `INSERT INTO pairings (id, child_public_key, created_at)
     VALUES (?, ?, ?)`,
  )
    .bind(id, body.childPublicKey, Date.now())
    .run();
  await env.KV.put(`code:${code}`, id, { expirationTtl: CODE_TTL_SEC });

  return json({ pairingId: id, code, expiresInSec: CODE_TTL_SEC });
}

/**
 * Parent side: joins the child's pairing by code. Authenticated — this is where
 * the link is bound to the parent's account. Stores the parent's public key and
 * the label, and returns the child's public key for the SAS check.
 */
async function pairJoin(req: Request, env: Env): Promise<Response> {
  const accountId = await authAccount(req, env);
  if (!accountId) return json({ error: "unauthorized" }, 401);

  const body = await readJson(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || !isPublicKey(body.parentPublicKey)) return json({ error: "bad_request" }, 400);
  const childLabel =
    typeof body.childLabel === "string" ? body.childLabel.slice(0, 40) : null;

  const pairingId = await env.KV.get(`code:${code}`);
  if (!pairingId) return json({ error: "bad_code" }, 404);

  const row = await env.DB.prepare(
    "SELECT parent_public_key, child_public_key FROM pairings WHERE id = ?",
  )
    .bind(pairingId)
    .first<{ parent_public_key: string | null; child_public_key: string | null }>();
  if (!row) return json({ error: "bad_code" }, 404);
  if (row.parent_public_key) return json({ error: "already_paired" }, 409);

  await env.DB.prepare(
    `UPDATE pairings
     SET account_id = ?, parent_public_key = ?, child_label = ?, paired_at = ?
     WHERE id = ?`,
  )
    .bind(accountId, body.parentPublicKey, childLabel, Date.now(), pairingId)
    .run();
  await env.KV.delete(`code:${code}`);

  return json({ pairingId, childPublicKey: row.child_public_key });
}

async function pairGet(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, child_label, parent_public_key, child_public_key, paired_at
     FROM pairings WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      child_label: string | null;
      parent_public_key: string | null;
      child_public_key: string | null;
      paired_at: number | null;
    }>();
  if (!row) return json({ error: "not_found" }, 404);

  return json({
    pairingId: row.id,
    childLabel: row.child_label,
    parentPublicKey: row.parent_public_key,
    childPublicKey: row.child_public_key,
    // The link is complete once the parent has joined (set their key).
    paired: row.parent_public_key !== null,
    pairedAt: row.paired_at,
  });
}

/**
 * Unpair: the owning parent deletes the pairing record and its server-side
 * traces (latest encrypted summary + pending commands). Idempotent.
 */
async function pairDelete(req: Request, env: Env, id: string): Promise<Response> {
  const accountId = await authAccount(req, env);
  if (!accountId) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare("SELECT account_id FROM pairings WHERE id = ?")
    .bind(id)
    .first<{ account_id: string }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (row.account_id !== accountId) return json({ error: "forbidden" }, 403);

  await env.DB.prepare("DELETE FROM pairings WHERE id = ?").bind(id).run();
  await env.KV.delete(`summary:${id}`);
  await env.KV.delete(`cmds:${id}`);
  return json({ ok: true });
}
