import { Env } from "./env";
import { json, readJson } from "./http";
import { randomOtp, sha256Hex, signJwt } from "./crypto";
import { sendOtpEmail } from "./email";
import { rateLimit } from "./ratelimit";

const OTP_TTL_SEC = 600; // 10 minutes
const JWT_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

/** Routes the /auth/* paths. */
export async function handleAuth(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/auth/request" && req.method === "POST") return authRequest(req, env);
  if (path === "/auth/verify" && req.method === "POST") return authVerify(req, env);
  return json({ error: "not_found" }, 404);
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

async function authRequest(req: Request, env: Env): Promise<Response> {
  const email = normalizeEmail((await readJson(req)).email);
  if (!email) return json({ error: "bad_email" }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `auth:${ip}`, 5, OTP_TTL_SEC))) {
    return json({ error: "rate_limited" }, 429);
  }

  const otp = randomOtp();
  await env.KV.put(`otp:${email}`, await sha256Hex(otp), { expirationTtl: OTP_TTL_SEC });
  await sendOtpEmail(env, email, otp);
  return json({ ok: true });
}

async function authVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  if (!email || !otp) return json({ error: "bad_request" }, 400);

  const stored = await env.KV.get(`otp:${email}`);
  if (!stored || stored !== (await sha256Hex(otp))) {
    return json({ error: "bad_otp" }, 401);
  }
  await env.KV.delete(`otp:${email}`);

  const accountId = await upsertAccount(env, email);
  const exp = Math.floor(Date.now() / 1000) + JWT_TTL_SEC;
  const token = await signJwt({ sub: accountId, exp }, env.JWT_SECRET);
  return json({ token });
}

/** Returns the existing account id for [email], creating the account if new. */
async function upsertAccount(env: Env, email: string): Promise<string> {
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, email, Date.now())
    .run();
  return id;
}
