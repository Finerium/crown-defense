-- Operational store (ADR-013): mutable current state, indexed for the dashboard under bounded reads.
CREATE TABLE IF NOT EXISTS hosts (
  host_id     TEXT PRIMARY KEY,
  hostname    TEXT NOT NULL,
  os          TEXT NOT NULL,
  ip          TEXT NOT NULL,
  segment     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PROTECTED',
  agent_id    TEXT,
  role        TEXT,
  criticality TEXT,
  risk        INTEGER,            -- UI-derived risk score (design extra; not a contract field, see notes)
  last_seen   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hosts_status ON hosts (status);
CREATE INDEX IF NOT EXISTS idx_hosts_segment ON hosts (segment);

CREATE TABLE IF NOT EXISTS agents (
  agent_id       TEXT PRIMARY KEY,
  host_id        TEXT NOT NULL,
  cert_subject   TEXT NOT NULL,
  version        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OFFLINE',
  canary_inventory JSONB NOT NULL DEFAULT '[]',
  last_heartbeat TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id       TEXT PRIMARY KEY,
  opened_at         TIMESTAMPTZ NOT NULL,
  closed_at         TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'OPEN',
  trigger_verdict_id TEXT,
  autonomy_mode     TEXT NOT NULL,
  affected_host_ids JSONB NOT NULL DEFAULT '[]',
  severity          TEXT NOT NULL DEFAULT 'critical',
  enrichment        JSONB NOT NULL DEFAULT '{}'   -- design-extra display fields sourced from LLM report/telemetry
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);

-- Single-row dial state. Default MONITOR_ONLY (the safest pilot default; AC-DIAL-04).
CREATE TABLE IF NOT EXISTS dial_state (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  position    TEXT NOT NULL DEFAULT 'MONITOR_ONLY',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT,
  CONSTRAINT dial_singleton CHECK (id = 1)
);
INSERT INTO dial_state (id, position) VALUES (1, 'MONITOR_ONLY')
  ON CONFLICT (id) DO NOTHING;

-- Pending dual-control approvals (realized fully in Phase 7).
CREATE TABLE IF NOT EXISTS approvals (
  approval_id   TEXT PRIMARY KEY,
  incident_id   TEXT,
  host_id       TEXT,
  action_type   TEXT NOT NULL,
  proposed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposed_by   TEXT NOT NULL,
  approved_by   TEXT,
  status        TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | DENIED | EXPIRED
  rollback_deadline TIMESTAMPTZ,
  detail        JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals (status);
