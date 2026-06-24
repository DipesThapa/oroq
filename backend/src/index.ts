import { Env, validateEnv } from "./env";
import { json } from "./http";
import { handleAuth } from "./auth";
import { handlePairing } from "./pairing";
import { handleSync } from "./sync";
import { handleCmd } from "./cmd";
import { handlePush } from "./push";
import { handleAccount } from "./account";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/auth/")) return await handleAuth(req, env, path);
      if (path.startsWith("/pair")) return await handlePairing(req, env, path);
      if (path.startsWith("/sync/")) return await handleSync(req, env, path);
      if (path.startsWith("/cmd/")) return await handleCmd(req, env, path);
      if (path.startsWith("/push/")) return await handlePush(req, env, path);
      if (path.startsWith("/account")) return await handleAccount(req, env, path);
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
