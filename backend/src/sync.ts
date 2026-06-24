import { Env } from "./env";
import { json, readJson } from "./http";
import { verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";
import { notifyAccount } from "./push";
import { requireChildToken } from "./childauth";

const SUMMARY_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

/** Routes the /sync/:pairingId paths. */
export async function handleSync(req: Request, env: Env, path: string): Promise<Response> {
  const match = path.match(/^\/sync\/([0-9a-f-]{36})$/);
  if (!match) return json({ error: "not_found" }, 404);
  const pairingId = match[1];
  if (req.method === "POST") return syncUpload(req, env, pairingId);
  if (req.method === "GET") return syncFetch(req, env, pairingId);
  return json({ error: "not_found" }, 404);
}

/** Child uploads an encrypted summary. The pairing must exist and be paired. */
async function syncUpload(req: Request, env: Env, pairingId: string): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `sync:${ip}`, 30, 600))) {
    return json({ error: "rate_limited" }, 429);
  }
  const denied = await requireChildToken(req, env, pairingId);
  if (denied) return denied;
  const body = await readJson(req);
  const ciphertext = body.ciphertext;
  const notify = body.notify === true;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > 100_000) {
    return json({ error: "bad_request" }, 400);
  }
  const row = await env.DB.prepare(
    "SELECT account_id, child_label, child_public_key FROM pairings WHERE id = ?",
  )
    .bind(pairingId)
    .first<{ account_id: string; child_label: string | null; child_public_key: string | null }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (!row.child_public_key) return json({ error: "not_paired" }, 409);

  await env.KV.put(`summary:${pairingId}`, ciphertext, { expirationTtl: SUMMARY_TTL_SEC });
  if (notify) {
    await notifyAccount(env, row.account_id, pairingId, row.child_label ?? "your child");
  }
  return json({ ok: true });
}

/** Parent fetches the latest encrypted summary for one of their pairings. */
async function syncFetch(req: Request, env: Env, pairingId: string): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  const accountId = payload && typeof payload.sub === "string" ? payload.sub : null;
  if (!accountId) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare("SELECT account_id FROM pairings WHERE id = ?")
    .bind(pairingId)
    .first<{ account_id: string }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (row.account_id !== accountId) return json({ error: "forbidden" }, 403);

  const ciphertext = await env.KV.get(`summary:${pairingId}`);
  return json({ ciphertext });
}
