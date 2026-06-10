-- Push tokens for parent devices. One account can have several devices.
CREATE TABLE push_tokens (
  account_id  TEXT NOT NULL,
  token       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (account_id, token)
);
CREATE INDEX idx_push_tokens_account ON push_tokens (account_id);
