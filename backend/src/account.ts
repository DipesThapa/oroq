import { Env } from "./env";
import { json } from "./http";
import { verifyJwt } from "./crypto";

/** Routes the /account paths. */
export async function handleAccount(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/account" && req.method === "DELETE") return accountDelete(req, env);
  return json({ error: "not_found" }, 404);
}

/**
 * Deletes the authenticated parent's account and everything tied to it: every
 * pairing they own (plus each pairing's encrypted summary + command queue in
 * KV), their push tokens, and the account row itself. Irreversible — this is
 * the Play "delete account" path. Idempotent: re-deleting a gone account still
 * returns ok.
 */
async function accountDelete(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  const accountId = payload && typeof payload.sub === "string" ? payload.sub : null;
  if (!accountId) return json({ error: "unauthorized" }, 401);

  // Clear KV traces for each of this account's pairings before dropping the rows.
  const pairings = await env.DB.prepare("SELECT id FROM pairings WHERE account_id = ?")
    .bind(accountId)
    .all<{ id: string }>();
  for (const row of pairings.results ?? []) {
    await env.KV.delete(`summary:${row.id}`);
    await env.KV.delete(`cmds:${row.id}`);
  }

  await env.DB.prepare("DELETE FROM pairings WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM push_tokens WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(accountId).run();

  return json({ ok: true });
}
