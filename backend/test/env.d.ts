import "@cloudflare/vitest-pool-workers";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    KV: KVNamespace;
    JWT_SECRET: string;
    TEST_MIGRATIONS: D1Migration[];
    LICENSE_PRIVATE_KEY_JWK?: string;
    LEMONSQUEEZY_WEBHOOK_SECRET?: string;
    GUMROAD_SELLER_ID?: string;
  }
}
