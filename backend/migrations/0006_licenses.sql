-- Migration 0006: OroQ Pro offline license fulfilment.
--
-- One row per purchase, keyed by the checkout provider's order id so a
-- redelivered webhook is idempotent (see license.ts). license_key is the
-- signed, offline-verifiable key e-mailed to the buyer. The email index backs
-- the /license/resend lookup ("re-send me my most recent key").
CREATE TABLE licenses (
  order_id     TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  license_key  TEXT NOT NULL,
  provider     TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_licenses_email ON licenses (email);
