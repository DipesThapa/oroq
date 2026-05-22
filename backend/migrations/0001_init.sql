-- Migration 0001: parent accounts and device pairings.
CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE pairings (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  child_label        TEXT,
  parent_public_key  TEXT NOT NULL,
  child_public_key   TEXT,
  created_at         INTEGER NOT NULL,
  paired_at          INTEGER
);

CREATE INDEX idx_pairings_account ON pairings (account_id);
