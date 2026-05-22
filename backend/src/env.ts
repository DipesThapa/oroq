export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

/** Throws if a required binding or secret is missing — the Worker must not run half-configured. */
export function validateEnv(env: Env): void {
  if (!env.DB) throw new Error("Missing D1 binding: DB");
  if (!env.KV) throw new Error("Missing KV binding: KV");
  if (!env.JWT_SECRET) throw new Error("Missing secret: JWT_SECRET");
}
