import { Env, validateEnv } from "./env";
import { json } from "./http";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
