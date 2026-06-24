-- Migration 0005: atomic rate-limit counters.
--
-- The KV-based limiter was a read-modify-write on eventually-consistent storage,
-- so concurrent requests all read the same count and passed, and every call
-- refreshed the TTL (sliding the window forever). This table backs an atomic,
-- fixed-window counter via a single upsert statement (audit M2).
--
-- Rows self-reset per key when their window expires (see ratelimit.ts), so the
-- table only grows with the number of distinct keys (IPs / emails) seen within
-- a window. A periodic purge of expired rows can reclaim space later if needed:
--   DELETE FROM rate_limits WHERE expires_at < <now>;
CREATE TABLE rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
