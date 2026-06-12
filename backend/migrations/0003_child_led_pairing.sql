-- Migration 0003: child-led pairing.
--
-- Pairing direction is inverted. The CHILD now creates the pairing (storing its
-- own public key and minting the code); the PARENT joins later (storing the
-- owning account_id + parent public key). So account_id and parent_public_key
-- are NULL until the parent joins, and child_public_key is set at creation.
--
-- SQLite/D1 cannot drop a NOT NULL constraint in place, so the table is rebuilt.
-- All existing rows are copied verbatim (no data loss); column order is
-- unchanged so `INSERT ... SELECT *` lines up.

ALTER TABLE pairings RENAME TO pairings_old;

CREATE TABLE pairings (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT,                 -- set when the parent joins
  child_label        TEXT,                 -- set by the parent at join time
  parent_public_key  TEXT,                 -- set when the parent joins
  child_public_key   TEXT,                 -- set when the child creates
  created_at         INTEGER NOT NULL,
  paired_at          INTEGER               -- when the parent joined
);

INSERT INTO pairings SELECT * FROM pairings_old;

DROP TABLE pairings_old;

CREATE INDEX idx_pairings_account ON pairings (account_id);
