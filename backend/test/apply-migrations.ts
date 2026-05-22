import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file before any test — creates the D1 tables.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
