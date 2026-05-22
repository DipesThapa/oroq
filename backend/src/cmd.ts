import { Env } from "./env";
import { json, readJson } from "./http";
import { verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";

const CMD_TTL_SEC = 60 * 60 * 24; // 24 hours

interface QueuedCommand { id: string; ciphertext: string }

/** Routes the /cmd/:pairingId paths. */
export async function handleCmd(req: Request, env: Env, path: string): Promise<Response> {
  const ackMatch = path.match(/^\/cmd\/([0-9a-f-]{36})\/ack$/);
  if (ackMatch && req.method === "POST") return cmdAck(req, env, ackMatch[1]);
  const match = path.match(/^\/cmd\/([0-9a-f-]{36})$/);
  if (!match) return json({ error: "not_found" }, 404);
  if (req.method === "POST") return cmdSend(req, env, match[1]);
  if (req.method === "GET") return cmdFetch(env, match[1]);
  return json({ error: "not_found" }, 404);
}

async function readQueue(env: Env, pairingId: string): Promise<QueuedCommand[]> {
  const raw = await env.KV.get(`cmds:${pairingId}`);
  if (!raw) return [];
  return JSON.parse(raw) as QueuedCommand[];
}

async function writeQueue(env: Env, pairingId: string, queue: QueuedCommand[]): Promise<void> {
  await env.KV.put(`cmds:${pairingId}`, JSON.stringify(queue), { expirationTtl: CMD_TTL_SEC });
}

/** Parent enqueues an encrypted command. Must own the pairing. */
async function cmdSend(req: Request, env: Env, pairingId: string): Promise<Response> {
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

  const ciphertext = (await readJson(req)).ciphertext;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > 20_000) {
    return json({ error: "bad_request" }, 400);
  }
  const id = crypto.randomUUID();
  const queue = await readQueue(env, pairingId);
  queue.push({ id, ciphertext });
  await writeQueue(env, pairingId, queue);
  return json({ id });
}

/** Child fetches pending commands. */
async function cmdFetch(env: Env, pairingId: string): Promise<Response> {
  return json({ commands: await readQueue(env, pairingId) });
}

/** Child acknowledges commands; the listed ids are removed from the queue. */
async function cmdAck(req: Request, env: Env, pairingId: string): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `ack:${ip}`, 60, 600))) return json({ error: "rate_limited" }, 429);
  const ids = (await readJson(req)).ids;
  if (!Array.isArray(ids)) return json({ error: "bad_request" }, 400);
  const remove = new Set(ids.map(String));
  const queue = (await readQueue(env, pairingId)).filter((c) => !remove.has(c.id));
  await writeQueue(env, pairingId, queue);
  return json({ ok: true });
}
