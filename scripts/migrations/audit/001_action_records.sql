-- Audit store (ADR-004/013). Append-only, hash-chained, WORM at the DB layer.
CREATE TABLE IF NOT EXISTS action_records (
  chain_seq      BIGINT PRIMARY KEY,
  action_id      TEXT UNIQUE NOT NULL,
  prev_hash      TEXT NOT NULL,
  record_hash    TEXT NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  incident_id    TEXT,
  host_id        TEXT,
  action_type    TEXT NOT NULL,
  autonomy_mode  TEXT NOT NULL,
  classification TEXT NOT NULL,
  record         JSONB NOT NULL,
  inserted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_records_occurred_at ON action_records (occurred_at);
CREATE INDEX IF NOT EXISTS idx_action_records_action_type ON action_records (action_type);
CREATE INDEX IF NOT EXISTS idx_action_records_incident ON action_records (incident_id);

-- WORM: reject any mutation or deletion of an audit record. Immutability is a DB-enforced invariant,
-- not merely an app convention. (AC-AUDIT-02 / AC-COMP-02.)
CREATE OR REPLACE FUNCTION audit_worm_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'action_records is append-only (WORM): % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_worm ON action_records;
CREATE TRIGGER trg_audit_worm
  BEFORE UPDATE OR DELETE OR TRUNCATE ON action_records
  FOR EACH STATEMENT EXECUTE FUNCTION audit_worm_guard();
