export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  /** OAuth web client id for Sign in with Google; blank disables /auth/google. */
  GOOGLE_CLIENT_ID?: string;
  /** Service-account JSON for FCM push (secret); unset disables push send. */
  FCM_SERVICE_ACCOUNT?: string;
  /** Firebase project id for the FCM v1 endpoint (var); unset disables push send. */
  FCM_PROJECT_ID?: string;
  /** "true" only in local dev — gates echoing the OTP to logs. Never set in prod. */
  DEV?: string;
  /** ECDSA P-256 private signing key as a JSON JWK string (secret). Unset disables /license. */
  LICENSE_PRIVATE_KEY_JWK?: string;
  /** Shared secret for verifying LemonSqueezy purchase webhooks (secret). */
  LEMONSQUEEZY_WEBHOOK_SECRET?: string;
  /** Gumroad seller id, used to authenticate Gumroad pings (public-ish, a var). */
  GUMROAD_SELLER_ID?: string;
}

/** Throws if a required binding or secret is missing — the Worker must not run half-configured. */
export function validateEnv(env: Env): void {
  if (!env.DB) throw new Error("Missing D1 binding: DB");
  if (!env.KV) throw new Error("Missing KV binding: KV");
  if (!env.JWT_SECRET) throw new Error("Missing secret: JWT_SECRET");
}
