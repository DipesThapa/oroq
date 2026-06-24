import { Env } from "./env";
import { json } from "./http";
import { sha256Hex, constantTimeEqual } from "./crypto";

/**
 * Authenticates a child-side request against the per-pairing bearer token minted
 * at pair/create (migration 0004). The child sends it in the `x-child-token`
 * header; the server stores only its SHA-256 hash.
 *
 * Returns null when authorized, or an error Response the caller should return.
 * Always 401 — never distinguishes "no such pairing" from "wrong token", so the
 * endpoint isn't an existence oracle for pairing ids.
 */
export async function requireChildToken(
  req: Request,
  env: Env,
  pairingId: string,
): Promise<Response | null> {
  const token = req.headers.get("x-child-token") ?? "";
  if (!token) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare("SELECT child_token_hash FROM pairings WHERE id = ?")
    .bind(pairingId)
    .first<{ child_token_hash: string | null }>();
  if (!row || !row.child_token_hash) return json({ error: "unauthorized" }, 401);

  if (!constantTimeEqual(await sha256Hex(token), row.child_token_hash)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}
